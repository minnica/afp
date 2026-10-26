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
                val store = BindingStore(applicationContext)
                val client = CaptureApiClient(applicationContext.getString(R.string.capture_origin), configurationReceived = app::applyRemoteConfiguration)
                store.read().lastOrNull()?.takeIf { it.deviceId != null && it.ownerId != null && it.state != "REVOKED" }?.let {
                    val refreshed = client.status(it)
                    store.save(refreshed)
                    if (refreshed.state != "REVOKED") {
                        // Un reporte pendiente no bloquea avisos ya guardados. Su fecha
                        // anterior permanece visible hasta que otro reporte se confirme.
                        val report = app.reportState()
                        try { client.report(refreshed, report) }
                        catch (_: CaptureApiException) { }
                        catch (_: java.io.IOException) { }
                        catch (_: org.json.JSONException) { }
                    }
                    if (refreshed.state == "ACTIVE") app.captureQueue.authorized(refreshed)
                }
                val engine = CaptureSyncEngine(app.captureQueue, { BindingStore(applicationContext).read() },
                    CaptureApiClient(applicationContext.getString(R.string.capture_origin))::sendEvent,
                    { app.deliveryPaused }, { isStopped })
                if (engine.drain() == SyncOutcome.RETRY) Result.retry() else {
                    ImportantNoticeScheduler.enqueue(applicationContext)
                    Result.success()
                }
            } catch (error: kotlinx.coroutines.CancellationException) { throw error }
            catch (error: CaptureApiException) {
                if (error.status == 429 && error.retryAfterMs > 0) {
                    CaptureSyncScheduler.enqueue(applicationContext, delayMs = error.retryAfterMs)
                    Result.success()
                } else Result.retry()
            }
            catch (_: java.io.IOException) { Result.retry() }
            catch (_: org.json.JSONException) { Result.retry() }
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
    fun enqueue(context: Context, manual: Boolean = false, delayMs: Long = 0) {
        val request = OneTimeWorkRequestBuilder<CaptureSyncWorker>().setConstraints(constraints())
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
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
