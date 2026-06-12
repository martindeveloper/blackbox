#include <jni.h>
#include <cstring>
#include <string>

#include "blackbox.h"

extern "C" {

JNIEXPORT void JNICALL
Java_com_blackbox_engine_Native_bbInit(JNIEnv *, jclass) {
    bb_init();
}

JNIEXPORT jlong JNICALL
Java_com_blackbox_engine_Native_bbAlloc(JNIEnv *, jclass, jint len) {
    return static_cast<jlong>(bb_alloc(static_cast<uint32_t>(len)));
}

JNIEXPORT void JNICALL
Java_com_blackbox_engine_Native_bbFree(JNIEnv *, jclass, jlong ptr, jint len) {
    bb_free(static_cast<size_t>(ptr), static_cast<uint32_t>(len));
}

JNIEXPORT jint JNICALL
Java_com_blackbox_engine_Native_bbEngineNew(
    JNIEnv *,
    jclass,
    jlong scenario_ptr,
    jint scenario_len,
    jlong items_ptr,
    jint items_len,
    jlong characters_ptr,
    jint characters_len,
    jlong assets_ptr,
    jint assets_len,
    jlong chapters_ptr,
    jint chapter_count,
    jlong library_ptr,
    jint library_len,
    jboolean has_random_seed_override,
    jlong random_seed_override) {
    return static_cast<jint>(bb_engine_new(
        static_cast<size_t>(scenario_ptr),
        static_cast<uint32_t>(scenario_len),
        static_cast<size_t>(items_ptr),
        static_cast<uint32_t>(items_len),
        static_cast<size_t>(characters_ptr),
        static_cast<uint32_t>(characters_len),
        static_cast<size_t>(assets_ptr),
        static_cast<uint32_t>(assets_len),
        static_cast<size_t>(chapters_ptr),
        static_cast<uint32_t>(chapter_count),
        static_cast<size_t>(library_ptr),
        static_cast<uint32_t>(library_len),
        has_random_seed_override == JNI_TRUE,
        static_cast<uint64_t>(random_seed_override)));
}

JNIEXPORT void JNICALL
Java_com_blackbox_engine_Native_bbEngineFree(JNIEnv *, jclass, jint handle) {
    bb_engine_free(static_cast<uint32_t>(handle));
}

JNIEXPORT jint JNICALL
Java_com_blackbox_engine_Native_bbGetView(JNIEnv *, jclass, jint handle, jlong out_ptr, jint out_cap) {
    return bb_get_view(
        static_cast<uint32_t>(handle),
        static_cast<size_t>(out_ptr),
        static_cast<uint32_t>(out_cap));
}

JNIEXPORT jint JNICALL
Java_com_blackbox_engine_Native_bbSubmit(
    JNIEnv *,
    jclass,
    jint handle,
    jlong in_ptr,
    jint in_len,
    jint view_revision,
    jlong out_ptr,
    jint out_cap) {
    return bb_submit(
        static_cast<uint32_t>(handle),
        static_cast<size_t>(in_ptr),
        static_cast<uint32_t>(in_len),
        static_cast<uint32_t>(view_revision),
        static_cast<size_t>(out_ptr),
        static_cast<uint32_t>(out_cap));
}

JNIEXPORT jint JNICALL
Java_com_blackbox_engine_Native_bbLoadCatalog(
    JNIEnv *,
    jclass,
    jint handle,
    jlong in_ptr,
    jint in_len) {
    return bb_load_catalog(
        static_cast<uint32_t>(handle),
        static_cast<size_t>(in_ptr),
        static_cast<uint32_t>(in_len));
}

JNIEXPORT jint JNICALL
Java_com_blackbox_engine_Native_bbLoadLibrary(
    JNIEnv *,
    jclass,
    jint handle,
    jlong in_ptr,
    jint in_len) {
    return bb_load_library(
        static_cast<uint32_t>(handle),
        static_cast<size_t>(in_ptr),
        static_cast<uint32_t>(in_len));
}

JNIEXPORT jint JNICALL
Java_com_blackbox_engine_Native_bbLoadChapter(
    JNIEnv *,
    jclass,
    jint handle,
    jlong in_ptr,
    jint in_len) {
    return bb_load_chapter(
        static_cast<uint32_t>(handle),
        static_cast<size_t>(in_ptr),
        static_cast<uint32_t>(in_len));
}

JNIEXPORT jint JNICALL
Java_com_blackbox_engine_Native_bbUnloadChapter(
    JNIEnv *,
    jclass,
    jint handle,
    jlong in_ptr,
    jint in_len) {
    return bb_unload_chapter(
        static_cast<uint32_t>(handle),
        static_cast<size_t>(in_ptr),
        static_cast<uint32_t>(in_len));
}

JNIEXPORT jint JNICALL
Java_com_blackbox_engine_Native_bbSerialize(JNIEnv *, jclass, jint handle, jlong out_ptr, jint out_cap) {
    return bb_serialize(
        static_cast<uint32_t>(handle),
        static_cast<size_t>(out_ptr),
        static_cast<uint32_t>(out_cap));
}

JNIEXPORT jint JNICALL
Java_com_blackbox_engine_Native_bbRestore(
    JNIEnv *,
    jclass,
    jint handle,
    jlong in_ptr,
    jint in_len,
    jlong out_ptr,
    jint out_cap) {
    return bb_restore(
        static_cast<uint32_t>(handle),
        static_cast<size_t>(in_ptr),
        static_cast<uint32_t>(in_len),
        static_cast<size_t>(out_ptr),
        static_cast<uint32_t>(out_cap));
}

JNIEXPORT jint JNICALL
Java_com_blackbox_engine_Native_bbLastError(JNIEnv *, jclass, jlong out_ptr, jint out_cap) {
    return bb_last_error(static_cast<size_t>(out_ptr), static_cast<uint32_t>(out_cap));
}

JNIEXPORT void JNICALL
Java_com_blackbox_engine_Native_copyBytes(JNIEnv *env, jobject, jlong ptr, jbyteArray bytes) {
    const jsize len = env->GetArrayLength(bytes);
    if (len <= 0) {
        return;
    }
    jbyte *data = env->GetByteArrayElements(bytes, nullptr);
    std::memcpy(reinterpret_cast<void *>(static_cast<size_t>(ptr)), data, static_cast<size_t>(len));
    env->ReleaseByteArrayElements(bytes, data, JNI_ABORT);
}

JNIEXPORT jstring JNICALL
Java_com_blackbox_engine_Native_decode(JNIEnv *env, jobject, jlong ptr, jint len) {
    const char *chars = reinterpret_cast<const char *>(static_cast<size_t>(ptr));
    return env->NewStringUTF(std::string(chars, static_cast<size_t>(len)).c_str());
}

}
