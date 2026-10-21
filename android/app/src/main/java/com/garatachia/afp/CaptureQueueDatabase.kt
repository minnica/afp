package com.garatachia.afp

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow
import java.io.File

@Entity(tableName = "capture_queue", indices = [Index(value = ["deviceId", "ownerId", "fingerprint"], unique = true), Index(value = ["state", "createdAt"])])
data class QueuedCapture(
    @PrimaryKey val eventId: String,
    val deviceId: String,
    val ownerId: String,
    val fingerprint: String,
    val payload: ByteArray,
    val createdAt: Long,
    val state: String = "PENDING",
    val attempts: Int = 0,
    val error: String? = null,
    val nextAttemptAt: Long = 0,
    val confirmedAt: Long? = null,
) {
    fun identity() = "$eventId:$deviceId:$ownerId:$fingerprint"
    override fun toString() = "QueuedCapture(state=$state, attempts=$attempts, content=redacted)"
}

@Entity(tableName = "capture_blocks", primaryKeys = ["deviceId", "ownerId"])
data class CaptureBlock(val deviceId: String, val ownerId: String, val reason: String)

data class QueueTotals(val pending: Int, val review: Int, val sent: Int, val lastConfirmedAt: Long?)

@Dao
interface CaptureQueueDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) fun insert(event: QueuedCapture): Long
    @Query("SELECT * FROM capture_queue WHERE deviceId = :device AND ownerId = :owner AND fingerprint = :fingerprint")
    fun byFingerprint(device: String, owner: String, fingerprint: String): QueuedCapture?
    @Query("SELECT * FROM capture_queue WHERE fingerprint = :fingerprint ORDER BY createdAt LIMIT 1")
    fun originalPublication(fingerprint: String): QueuedCapture?
    @Query("SELECT * FROM capture_queue WHERE eventId = :id") fun byId(id: String): QueuedCapture?
    @Query("SELECT * FROM capture_queue q WHERE state = 'PENDING' AND NOT EXISTS (SELECT 1 FROM capture_blocks b WHERE b.deviceId = q.deviceId AND b.ownerId = q.ownerId) ORDER BY createdAt, eventId LIMIT 100") fun pending(): List<QueuedCapture>
    @Query("UPDATE capture_queue SET state = 'SENT', payload = X'', error = NULL, confirmedAt = :confirmedAt WHERE eventId = :id AND state = 'PENDING'")
    fun confirm(id: String, confirmedAt: Long)
    @Query("UPDATE capture_queue SET attempts = attempts + 1 WHERE eventId = :id AND state = 'PENDING'") fun attempted(id: String)
    @Query("UPDATE capture_queue SET state = :state, error = :error, nextAttemptAt = :nextAttempt WHERE eventId = :id AND state = 'PENDING'")
    fun fail(id: String, state: String, error: String, nextAttempt: Long = 0)
    @Query("UPDATE capture_queue SET state = 'PENDING', error = NULL, nextAttemptAt = 0 WHERE state = 'REVIEW' AND error != 'CIPHER'") fun retryReview()
    @Query("SELECT * FROM capture_queue WHERE error IS NOT NULL ORDER BY CASE WHEN state = 'REVIEW' THEN 0 ELSE 1 END, createdAt LIMIT 10") fun errors(): Flow<List<QueuedCapture>>
    @Query("SELECT COALESCE(SUM(CASE WHEN state = 'PENDING' THEN 1 ELSE 0 END),0) AS pending, COALESCE(SUM(CASE WHEN state = 'REVIEW' THEN 1 ELSE 0 END),0) AS review, COALESCE(SUM(CASE WHEN state = 'SENT' THEN 1 ELSE 0 END),0) AS sent, MAX(confirmedAt) AS lastConfirmedAt FROM capture_queue")
    fun totals(): Flow<QueueTotals>
    @Insert(onConflict = OnConflictStrategy.REPLACE) fun block(value: CaptureBlock)
    @Query("SELECT * FROM capture_blocks WHERE deviceId = :device AND ownerId = :owner") fun blockFor(device: String, owner: String): CaptureBlock?
    @Query("SELECT * FROM capture_blocks") fun blocks(): Flow<List<CaptureBlock>>
    @Query("DELETE FROM capture_blocks WHERE deviceId = :device AND ownerId = :owner") fun unblock(device: String, owner: String)
}

@Database(entities = [QueuedCapture::class, CaptureBlock::class], version = 1, exportSchema = true)
abstract class CaptureQueueDatabase : RoomDatabase() {
    abstract fun queue(): CaptureQueueDao
    companion object {
        fun open(context: Context, name: String = "capture-queue.db") = Room.databaseBuilder(
            context.applicationContext, CaptureQueueDatabase::class.java,
            File(context.noBackupFilesDir, name).absolutePath).build()
    }
}
