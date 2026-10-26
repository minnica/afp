package com.garatachia.afp

import android.content.Context
import androidx.work.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class ImportantNoticeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        mutex.withLock {
            val center = (applicationContext as CaptureApplication).importantNotices
            if (!center.enabled || !center.permitted()) {
                center.clear()
                return@withLock Result.success()
            }
            try {
                val binding = BindingStore(applicationContext).read().lastOrNull()
                if (binding?.ownerId == null || binding.deviceId == null || binding.state != "ACTIVE") {
                    center.clear()
                    center.status.value = "Vincula y autoriza este teléfono en AFP para recibir sus avisos."
                    return@withLock Result.success()
                }
                val response = CaptureApiClient(applicationContext.getString(R.string.capture_origin)).notices(binding)
                if (!isStopped) center.apply(binding, response)
                Result.success()
            } catch (error: CancellationException) { throw error }
            catch (error: CaptureApiException) {
                when (error.status) {
                    401, 403 -> {
                        center.clear()
                        center.status.value = "La vinculación está pausada o revocada. Consulta el estado del teléfono."
                        Result.success()
                    }
                    404 -> {
                        center.status.value = "El servidor de AFP necesita actualizarse para enviar estos avisos."
                        Result.success()
                    }
                    429 -> {
                        ImportantNoticeScheduler.enqueueDelayed(applicationContext, error.retryAfterMs.coerceAtLeast(30_000))
                        Result.success()
                    }
                    else -> {
                        center.status.value = "No se pudieron actualizar los avisos. Se volverá a intentar con conexión."
                        Result.retry()
                    }
                }
            } catch (_: Exception) {
                center.status.value = "No se pudieron actualizar los avisos. Se volverá a intentar con conexión."
                Result.retry()
            }
        }
    }
    companion object { private val mutex = Mutex() }
}

object ImportantNoticeScheduler {
    private fun constraints() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    private fun request(delayMs: Long = 0) = OneTimeWorkRequestBuilder<ImportantNoticeWorker>()
        .setConstraints(constraints()).setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()

    fun enqueue(context: Context) {
        WorkManager.getInstance(context).enqueueUniqueWork("important-notices-now", ExistingWorkPolicy.KEEP, request())
    }

    fun enqueueDelayed(context: Context, delayMs: Long) {
        WorkManager.getInstance(context).enqueueUniqueWork("important-notices-retry", ExistingWorkPolicy.REPLACE, request(delayMs))
    }

    fun recover(context: Context) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("important-notices", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<ImportantNoticeWorker>(15, TimeUnit.MINUTES).setConstraints(constraints())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
        enqueue(context)
    }
}
