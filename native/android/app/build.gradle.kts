plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Optional release signing: CI passes these as environment variables when the
// ANDROID_KEYSTORE_* secrets exist. Without them only the debug APK is built.
val releaseStoreFile: String? = System.getenv("TELEX_KEYSTORE_FILE")?.takeIf { it.isNotBlank() }

android {
    namespace = "io.github.gl1ch5.telex"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.gl1ch5.telex"
        minSdk = 24
        targetSdk = 35
        versionCode = (System.getenv("TELEX_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("TELEX_VERSION_NAME") ?: "1.0"
    }

    signingConfigs {
        // Fixed, public debug key (password "android") so every nightly debug APK
        // has the same signature and installs as an update, keeping the session.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        if (releaseStoreFile != null) {
            create("release") {
                storeFile = file(releaseStoreFile)
                storePassword = System.getenv("TELEX_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("TELEX_KEY_ALIAS")
                keyPassword = System.getenv("TELEX_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (releaseStoreFile != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// The web app is packed into the APK (assets/web) and answered locally for https://telex-web.ru/app/static/…
// (see AppAssets): the interface opens instantly and works offline. The origin stays the same, so the
// Telegram session in localStorage / IndexedDB is kept.
val webOut = layout.buildDirectory.dir("generated/web")
val copyWeb by tasks.registering(Copy::class) {
    from(rootProject.projectDir.resolve("../../app/static")) {
        exclude("**/*.md", "**/*.map")
    }
    into(webOut.map { it.dir("web") })
}
android.sourceSets.getByName("main").assets.srcDir(webOut)
tasks.configureEach { if (name.startsWith("merge") && name.endsWith("Assets")) dependsOn(copyWeb) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
}
