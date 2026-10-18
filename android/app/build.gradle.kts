import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseSigningPropertiesFile = rootProject.file("keystore.properties")
val releaseSigningProperties = Properties().apply {
    if (releaseSigningPropertiesFile.isFile) {
        releaseSigningPropertiesFile.inputStream().use(::load)
    }
}
val releaseStoreFile = releaseSigningProperties.getProperty("storeFile")
    ?: System.getenv("ANDROID_KEYSTORE_PATH")
val releaseStorePassword = releaseSigningProperties.getProperty("storePassword")
    ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = releaseSigningProperties.getProperty("keyAlias")
    ?: System.getenv("ANDROID_KEY_ALIAS")
val releaseKeyPassword = releaseSigningProperties.getProperty("keyPassword")
    ?: System.getenv("ANDROID_KEY_PASSWORD")
val hasReleaseSigning = listOf(
    releaseStoreFile,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword
).all { !it.isNullOrBlank() }

val webProjectRoot = rootProject.projectDir.parentFile
val packageVersion = ((groovy.json.JsonSlurper().parse(webProjectRoot.resolve("package.json")) as Map<*, *>)
    ["version"] as? String) ?: throw GradleException("package.json must define a string version.")
val releaseVersionName = providers.gradleProperty("releaseVersionName").orElse(packageVersion)
val buildWebBundle = tasks.register<Exec>("buildWebBundle") {
    workingDir(webProjectRoot)
    environment("VITE_APP_VERSION", releaseVersionName.get())
    if (System.getProperty("os.name").startsWith("Windows", ignoreCase = true)) {
        commandLine("cmd", "/c", "node node_modules/vite/bin/vite.js build")
    } else {
        commandLine("node", "node_modules/vite/bin/vite.js", "build")
    }
}

val syncWebAssets = tasks.register<Sync>("syncWebAssets") {
    dependsOn(buildWebBundle)
    from(webProjectRoot.resolve("dist"))
    into(layout.projectDirectory.dir("src/main/assets/www"))
}

tasks.named("preBuild").configure {
    dependsOn(syncWebAssets)
}

android {
    namespace = "com.pixelapps.speedxpat"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.pixelapps.speedxpat"
        minSdk = 26
        targetSdk = 34
        versionCode = providers.gradleProperty("releaseVersionCode").orElse("1").get().toInt()
        versionName = releaseVersionName.get()

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(requireNotNull(releaseStoreFile))
                storePassword = requireNotNull(releaseStorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
        }
    }

    buildFeatures {
        viewBinding = true
    }
}

val copyDebugApk = tasks.register<Copy>("copyDebugApk") {
    dependsOn("assembleDebug")
    from(layout.buildDirectory.file("outputs/apk/debug/app-debug.apk"))
    into(layout.buildDirectory.dir("outputs/apk/named"))
    rename { "SpeedXpat-debug.apk" }
}

tasks.matching { it.name == "assembleDebug" }.configureEach {
    finalizedBy(copyDebugApk)
}

tasks.matching { it.name == "packageRelease" }.configureEach {
    doFirst {
        if (!hasReleaseSigning) {
            throw GradleException(
                "Release signing is not configured. Set android/keystore.properties or the " +
                    "ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, and " +
                    "ANDROID_KEY_PASSWORD environment variables."
            )
        }
        if (!rootProject.file(requireNotNull(releaseStoreFile)).isFile) {
            throw GradleException("Release keystore was not found at the configured storeFile.")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.webkit:webkit:1.11.0")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}
