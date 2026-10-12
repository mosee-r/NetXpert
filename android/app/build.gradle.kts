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

val webProjectRoot = rootProject.projectDir.parentFile
val buildWebBundle = tasks.register<Exec>("buildWebBundle") {
    workingDir(webProjectRoot)
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
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (releaseSigningPropertiesFile.isFile) {
            create("release") {
                storeFile = rootProject.file(releaseSigningProperties.getProperty("storeFile"))
                storePassword = releaseSigningProperties.getProperty("storePassword")
                keyAlias = releaseSigningProperties.getProperty("keyAlias")
                keyPassword = releaseSigningProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (releaseSigningPropertiesFile.isFile) {
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

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }
}

tasks.matching { it.name == "packageRelease" }.configureEach {
    doFirst {
        if (!releaseSigningPropertiesFile.isFile) {
            throw GradleException("Release signing is not configured. Create android/keystore.properties.")
        }
        val keystorePath = releaseSigningProperties.getProperty("storeFile")
            ?: throw GradleException("Release signing is missing storeFile in keystore.properties.")
        if (!rootProject.file(keystorePath).isFile) {
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
