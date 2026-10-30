import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

val signing = Properties().apply {
    val source = rootProject.file("signing.properties")
    if (source.exists()) source.inputStream().use { load(it) }
}

android {
    namespace = "com.garatachia.afp"
    compileSdk = 37
    defaultConfig {
        applicationId = "com.garatachia.afp"
        minSdk = 28
        targetSdk = 36
        versionCode = 13
        versionName = "0.9.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["webHost"] = "finanzas.garatachia.com"
        resValue("string", "web_url", "https://finanzas.garatachia.com/gastos")
        resValue("string", "capture_origin", "https://finanzas.garatachia.com")
        resValue("string", "asset_statements", """[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"web","site":"https://finanzas.garatachia.com"}}]""")
    }
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file(".private/development.p12")
            storePassword = signing.getProperty("development.storePassword")
            keyAlias = "afp-development"
            keyPassword = signing.getProperty("development.storePassword")
        }
        create("production") {
            storeFile = rootProject.file(".private/production.p12")
            storePassword = signing.getProperty("production.storePassword")
            keyAlias = "afp-production"
            keyPassword = signing.getProperty("production.storePassword")
        }
    }
    buildTypes {
        debug {
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "AFP Diagnóstico dev")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("production")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            resValue("string", "app_name", "AFP")
        }
    }
    buildFeatures {
        compose = true
        resValues = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17 } }
ksp { arg("room.schemaLocation", "$projectDir/schemas") }

dependencies {
    implementation("com.google.mlkit:text-recognition:16.0.1")
    val composeBom = platform("androidx.compose:compose-bom:2026.04.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.activity:activity-compose:1.12.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
    implementation("androidx.room:room-runtime:2.8.5")
    ksp("androidx.room:room-compiler:2.8.5")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    androidTestImplementation("androidx.work:work-testing:2.12.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
