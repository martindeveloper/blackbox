cmake_minimum_required(VERSION 3.22.1)
project(blackbox_jni)

add_library(blackbox_jni SHARED blackbox_jni.cpp)

target_include_directories(blackbox_jni PRIVATE
    "${BLACKBOX_FFI_INCLUDE}"
)

# Prebuilt Rust artifact from node scripts/build-android-aarch64.mjs
add_library(blackbox_ffi SHARED IMPORTED)
set_target_properties(blackbox_ffi PROPERTIES
    IMPORTED_LOCATION "${BLACKBOX_FFI_LIB}/libblackbox_ffi.so"
)

target_link_libraries(blackbox_jni blackbox_ffi log)
