package com.garatachia.afp

import android.content.Context
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class CaptureSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val app = applicationContext as CaptureApplication
        app.syncMutex.withLock {
            try {
                val engine = CaptureSyncEngine(app.captureQueue, { BindingStore(applicationContext).read() },
                    CaptureApiClient(applicationContext.getString(R.string.capture_origin))::sendEvent,
                    { app.deliveryPaused }, { isStopped })
                if (engine.drain() == SyncOutcome.RETRY) Result.retry() else Result.success()
            } catch (error: kotlinx.coroutines.CancellationException) { throw error }
            catch (_: Exception) {
                app.queueStorageError.value = true
                Result.retry()
            }
        }
    }
}

object CaptureSyncScheduler {
    const val WORK_NAME = "capture-delivery"
    private fun constraints() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    fun enqueue(context: Context, manual: Boolean = false) {
        val request = OneTimeWorkRequestBuilder<CaptureSyncWorker>().setConstraints(constraints())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME,
            if (manual) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }
    fun recover(context: Context) {
        // Cubre también una muerte del proceso entre el commit de Room y enqueue().
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("capture-delivery-recovery", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<CaptureSyncWorker>(15, TimeUnit.MINUTES).setConstraints(constraints())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
        enqueue(context)
    }
}
