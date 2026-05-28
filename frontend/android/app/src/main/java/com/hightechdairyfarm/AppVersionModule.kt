package com.hightechdairyfarm

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class AppVersionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppVersion"

  override fun getConstants(): Map<String, Any> {
    return mapOf(
      "versionCode" to BuildConfig.VERSION_CODE,
      "versionName" to BuildConfig.VERSION_NAME
    )
  }
}
