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
import com.facebook.react.soloader.OpenSourceMergedSoMapping
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

  // EXPERIMENT (2026-09-13, see git history / MOBILE_CAPTURE_TOOLS_HANDOFF.md before
  // reverting): this used to unconditionally return null, forcing legacy bridge mode,
  // specifically to keep Detox v20 working (Detox calls
  // reactNativeHost.reactInstanceManager, which crashes when the real bridgeless
  // ReactHostImpl is active). That null reactHost is confirmed to have directly caused
  // a real crash (Reanimated's DevMenuUtils.addDevMenuOption() dereferences
  // getReactHost() unconditionally and NPEs on null -- patched separately via
  // patches/react-native-reanimated+*.patch, but that patch only silences Reanimated's
  // own crash, not the underlying null). Restoring the real ReactHost here to test
  // whether it also explains a second bug: expo-av's Audio.requestPermissionsAsync()
  // hanging indefinitely (never resolves, no dialog, no error) for a user who has
  // never granted mic permission before -- getPermissionsAsync() (no Activity
  // round-trip needed) always worked fine, only the Activity-callback-dependent
  // request path hung, and reactHost=null is the one confirmed Activity/ReactHost
  // wiring gap in this app so far.
  // If this breaks Detox v20 again: that's the real tradeoff to weigh (revert this,
  // and either accept the permission bug for genuinely new users, or find a
  // Detox-compatible fix that doesn't require nulling reactHost entirely).
  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    // SoLoader must be initialized before DefaultNewArchitectureEntryPoint.load(),
    // which calls SoLoader.loadLibrary("react_newarchdefaults"). RN 0.79+ merges many
    // small native libs (including libreact_featureflagsjni.so) into one merged .so —
    // SoLoader needs OpenSourceMergedSoMapping to know how to resolve symbols out of it,
    // otherwise it throws SoLoaderDSONotFoundError for anything that got merged.
    SoLoader.init(this, OpenSourceMergedSoMapping)
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    // EXPERIMENT (2026-09-13): was load(bridgelessEnabled = false) for Detox v20
    // compatibility — reverted to the default (bridgeless enabled) alongside the
    // reactHost change above. See that comment for why.
    DefaultNewArchitectureEntryPoint.load()
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
