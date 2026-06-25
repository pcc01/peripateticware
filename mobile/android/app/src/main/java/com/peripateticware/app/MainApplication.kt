package com.peripateticware.app

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
    this,
    object : DefaultReactNativeHost(this) {
      override fun getPackages() = PackageList(this).packages.apply {
        // Packages that cannot be autolinked yet can be added manually here
      }

      override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      override val isHermesEnabled: Boolean = true
    }
  )

  // Return null so React Native uses the bridge path (reactNativeHost above) rather
  // than ReactHostImpl (bridgeless). Detox v20 calls reactNativeHost.reactInstanceManager
  // which crashes when ReactHostImpl is active.  Returning null here is safe because
  // DefaultNewArchitectureEntryPoint.load(bridgelessEnabled=false) below disables the
  // bridgeless feature flags, keeping TurboModules and Fabric on the bridge.
  override val reactHost: ReactHost? = null

  override fun onCreate() {
    super.onCreate()
    // SoLoader must be initialized before DefaultNewArchitectureEntryPoint.load(),
    // which calls SoLoader.loadLibrary("react_newarchdefaults").
    SoLoader.init(this, false)
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    // bridgelessEnabled=false: disable the ReactHostImpl bridgeless runtime while
    // keeping TurboModules and Fabric enabled over the bridge. This is required for
    // Detox v20 compatibility with RN 0.81 — the @Deprecated overload is intentional.
    @Suppress("DEPRECATION")
    DefaultNewArchitectureEntryPoint.load(bridgelessEnabled = false)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
