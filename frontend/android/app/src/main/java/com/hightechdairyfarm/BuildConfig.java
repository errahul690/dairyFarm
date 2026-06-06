package com.hightechdairyfarm;

/**
 * Compatibility shim for generated sources that still reference the old package name.
 * Remove once React Native/Gradle generation picks up the new namespace everywhere.
 */
public final class BuildConfig {
  private BuildConfig() {}

  // Keep these in sync with `frontend/android/gradle.properties`
  public static final boolean IS_NEW_ARCHITECTURE_ENABLED = true;
  public static final boolean IS_EDGE_TO_EDGE_ENABLED = false;
}

