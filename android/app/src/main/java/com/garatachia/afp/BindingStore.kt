package com.garatachia.afp

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// Historial cifrado de identidades. Revocar nunca traslada datos a otra cuenta.
class BindingStore(context: Context, name: String = "capture-bindings") {
    private val file = AtomicFile(File(context.noBackupFilesDir, "$name.enc"))
    private val keyAlias = "afp.$name.v1"
    fun read(): List<CaptureBinding> = synchronized(lock) {
        if (!file.baseFile.exists()) return@synchronized emptyList()
        val bytes = file.openRead().use { it.readBytes() }
        require(bytes.size >= 29 && bytes[0] == 1.toByte())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
        val list = JSONArray(String(cipher.doFinal(bytes.copyOfRange(13, bytes.size)), Charsets.UTF_8))
        (0 until list.length()).map { index ->
            val row = list.getJSONObject(index)
            fun optional(name: String) = if (row.isNull(name)) null else row.getString(name)
            CaptureBinding(row.getString("secret"), optional("deviceId"), optional("ownerId"),
                row.getString("state"), optional("code"), optional("expiresAt"))
        }
    }
    fun save(binding: CaptureBinding, newIdentity: Boolean = false) = synchronized(lock) {
        val previous = read()
        val current = previous.lastOrNull()
        if (newIdentity) require(current == null || current.replaceable)
        else {
            require(current != null && current.secret == binding.secret)
            require(current.ownerId == null || current.ownerId == binding.ownerId)
        }
        val rows = if (newIdentity) previous + binding else previous.dropLast(1) + binding
        val json = JSONArray(rows.map { row -> JSONObject().apply {
            put("secret", row.secret); put("deviceId", row.deviceId ?: JSONObject.NULL)
            put("ownerId", row.ownerId ?: JSONObject.NULL); put("state", row.state)
            put("code", row.code ?: JSONObject.NULL); put("expiresAt", row.expiresAt ?: JSONObject.NULL)
        } })
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val bytes = byteArrayOf(1) + cipher.iv + cipher.doFinal(json.toString().toByteArray(Charsets.UTF_8))
        val output = file.startWrite()
        try { output.write(bytes); file.finishWrite(output) }
        catch (error: Exception) { file.failWrite(output); throw error }
    }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
            generateKey()
        }
    }
    companion object { private val lock = Any() }
}
