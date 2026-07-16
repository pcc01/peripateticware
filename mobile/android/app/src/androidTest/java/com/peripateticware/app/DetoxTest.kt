package com.peripateticware.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.ActivityTestRule
import com.wix.detox.Detox
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

// Required by Detox's Android manual setup — see the doc comment on
// com.wix.detox.Detox#runTests in node_modules/detox/android/detox/src/full/java/com/wix/detox/Detox.java.
//
// This file was missing entirely (no android/app/src/androidTest directory existed).
// build.gradle already wires DetoxJUnitRunner as testInstrumentationRunner and pulls in
// androidTestImplementation(project(':detox')), so the test APK builds and instrumentation
// launches fine — but AndroidJUnitRunner scans the test APK's classpath for a @Test method
// to run, finds none that calls Detox.runTests(), so it runs 0 real work, reports
// "run started: 1 tests" against some default/fallback test, and exits in a couple of
// milliseconds ("finished inst") without ever starting MainActivity, React Native, or the
// Detox WebSocket bridge. That's why every launchApp() call has been hanging/timing out:
// nothing on the device side was ever driving the app or talking to the Detox server.
@RunWith(AndroidJUnit4::class)
class DetoxTest {
    @get:Rule
    var activityTestRule = ActivityTestRule(MainActivity::class.java, false, false)

    @Test
    fun runDetoxTests() {
        Detox.runTests(activityTestRule)
    }
}
