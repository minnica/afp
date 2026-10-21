package com.garatachia.afp

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONArray
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// Búfer local de diagnóstico. La cola de entrega con Room pertenece a la Fase 3.
class DiagnosticStore(context: Context, name: String = "diagnostic-samples") {
    private val file = AtomicFile(File(context.noBackupFilesDir, "$name.enc"))
    private val keyAlias = "afp.$name.v1"

    @Synchronized
    fun read(): List<DiagnosticSample> {
        if (!file.baseFile.exists()) return emptyList()
        val envelope = file.openRead().use { it.readBytes() }
        require(envelope.size >= 29 && envelope[0] == 1.toByte())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, envelope.copyOfRange(1, 13)))
        val json = JSONArray(String(cipher.doFinal(envelope.copyOfRange(13, envelope.size)), Charsets.UTF_8))
        return (0 until json.length()).map { DiagnosticSample.fromJson(json.getJSONObject(it)) }
    }

    @Synchronized
    fun append(sample: DiagnosticSample): List<DiagnosticSample> {
        val samples = (listOf(sample) + read()).take(100)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val payload = JSONArray(samples.map { it.toJson() }).toString().toByteArray(Charsets.UTF_8)
        val envelope = byteArrayOf(1) + cipher.iv + cipher.doFinal(payload)
        val output = file.startWrite()
        try {
            output.write(envelope)
            file.finishWrite(output)
        } catch (error: Exception) {
            file.failWrite(output)
            throw error
        }
        return samples
    }

    @Synchronized
    fun clear() { file.delete() }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
            generateKey()
        }
    }
}
