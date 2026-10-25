plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val lt4j = "2.1.0-38"

android {
    namespace = "ua.itorrent.client"
    compileSdk = 34

    defaultConfig {
        applicationId = "ua.itorrent.client"
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "1.0"
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
    }

    signingConfigs {
        create("release") {
            val ks = file(System.getenv("KEYSTORE") ?: "../itorrent.p12")
            if (ks.exists()) {
                storeFile = ks
                storeType = "pkcs12"
                storePassword = System.getenv("STORE_PASS") ?: "itorrent-android"
                keyAlias = System.getenv("KEY_ALIAS") ?: "itorrent"
                keyPassword = System.getenv("STORE_PASS") ?: "itorrent-android"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            val rel = signingConfigs.getByName("release")
            signingConfig = if (rel.storeFile != null) rel else signingConfigs.getByName("debug")
        }
    }

    buildFeatures { buildConfig = true }

    packaging {
        jniLibs { useLegacyPackaging = true }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_1_8) }
}

dependencies {
    implementation("org.libtorrent4j:libtorrent4j:$lt4j")
    implementation("org.libtorrent4j:libtorrent4j-android-arm64:$lt4j")
    implementation("org.libtorrent4j:libtorrent4j-android-arm:$lt4j")
    implementation("org.libtorrent4j:libtorrent4j-android-x86_64:$lt4j")
}
