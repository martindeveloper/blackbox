package com.blackbox.engine

class BlackboxEngine private constructor(private val handle: Int) : AutoCloseable {
    init {
        require(handle != 0) { "invalid engine handle" }
    }

    override fun close() {
        Native.bbEngineFree(handle)
    }

    fun getCurrentView(): String = Native.callWithOutput { outPtr, outCap ->
        Native.bbGetView(handle, outPtr, outCap)
    }

    fun submitCommand(json: String, viewRevision: Int): String = Native.callWithUtf8Input(json) { inPtr, inLen, outPtr, outCap ->
        Native.bbSubmit(handle, inPtr, inLen, viewRevision, outPtr, outCap)
    }

    fun loadCatalog(bytes: ByteArray) = Native.callWithBytesInput(bytes) { ptr, len ->
        Native.bbLoadCatalog(handle, ptr, len)
    }

    fun loadLibrary(bytes: ByteArray) = Native.callWithBytesInput(bytes) { ptr, len ->
        Native.bbLoadLibrary(handle, ptr, len)
    }

    fun loadChapter(bytes: ByteArray) = Native.callWithBytesInput(bytes) { ptr, len ->
        Native.bbLoadChapter(handle, ptr, len)
    }

    fun unloadChapter(chapterId: String) =
        Native.callWithBytesInput(chapterId.toByteArray(Charsets.UTF_8)) { ptr, len ->
            Native.bbUnloadChapter(handle, ptr, len)
        }

    fun serializeState(): String = Native.callWithOutput { outPtr, outCap ->
        Native.bbSerialize(handle, outPtr, outCap)
    }

    fun restoreState(json: String): String = Native.callWithUtf8Input(json) { inPtr, inLen, outPtr, outCap ->
        Native.bbRestore(handle, inPtr, inLen, outPtr, outCap)
    }

    companion object {
        fun initialize() {
            Native.bbInit()
        }

        fun create(
            scenario: ByteArray,
            items: ByteArray,
            characters: ByteArray,
            assets: ByteArray,
            chapters: List<ByteArray>,
            library: ByteArray? = null,
            randomSeedOverride: ULong? = null,
        ): BlackboxEngine {
            val scenarioCopy = Native.copyIntoRust(scenario)
            val itemsCopy = Native.copyIntoRust(items)
            val charactersCopy = Native.copyIntoRust(characters)
            val assetsCopy = Native.copyIntoRust(assets)
            val libraryCopy = Native.copyIntoRust(library ?: byteArrayOf())
            val chapterCopies = chapters.map { Native.copyIntoRust(it) }

            val tablePtr: Long
            val tableLen: Int
            if (chapterCopies.isEmpty()) {
                tablePtr = 0L
                tableLen = 0
            } else {
                val stride = 16 // matches #[repr(C)] ByteSlice on 64-bit (usize + u32 + padding)
                val table = ByteArray(chapterCopies.size * stride)
                var offset = 0
                for (copy in chapterCopies) {
                    writePtr(table, offset, copy.ptr)
                    writeU32(table, offset + 8, copy.len)
                    offset += stride
                }
                tableLen = table.size
                tablePtr = Native.copyIntoRust(table).ptr
            }

            try {
                val handle = Native.bbEngineNew(
                    scenarioCopy.ptr,
                    scenarioCopy.len,
                    itemsCopy.ptr,
                    itemsCopy.len,
                    charactersCopy.ptr,
                    charactersCopy.len,
                    assetsCopy.ptr,
                    assetsCopy.len,
                    tablePtr,
                    chapters.size,
                    libraryCopy.ptr,
                    libraryCopy.len,
                    randomSeedOverride != null,
                    randomSeedOverride?.toLong() ?: 0L,
                )
                if (handle == 0) {
                    error(Native.readLastError())
                }
                return BlackboxEngine(handle)
            } finally {
                Native.freeCopy(scenarioCopy)
                Native.freeCopy(itemsCopy)
                Native.freeCopy(charactersCopy)
                Native.freeCopy(assetsCopy)
                Native.freeCopy(libraryCopy)
                for (copy in chapterCopies) {
                    Native.freeCopy(copy)
                }
                if (tablePtr != 0L) {
                    Native.bbFree(tablePtr, tableLen)
                }
            }
        }

        private fun writePtr(buffer: ByteArray, offset: Int, value: Long) {
            for (shift in 0 until 8) {
                buffer[offset + shift] = ((value ushr (8 * shift)) and 0xFF).toByte()
            }
        }

        private fun writeU32(buffer: ByteArray, offset: Int, value: Int) {
            for (shift in 0 until 4) {
                buffer[offset + shift] = ((value ushr (8 * shift)) and 0xFF).toByte()
            }
        }
    }
}

internal object Native {
    init {
        System.loadLibrary("blackbox_ffi")
        System.loadLibrary("blackbox_jni")
    }

    data class Copy(val ptr: Long, val len: Int)

    external fun bbInit()
    external fun bbAlloc(len: Int): Long
    external fun bbFree(ptr: Long, len: Int)
    external fun bbEngineNew(
        scenarioPtr: Long,
        scenarioLen: Int,
        itemsPtr: Long,
        itemsLen: Int,
        charactersPtr: Long,
        charactersLen: Int,
        assetsPtr: Long,
        assetsLen: Int,
        chaptersPtr: Long,
        chapterCount: Int,
        libraryPtr: Long,
        libraryLen: Int,
        hasRandomSeedOverride: Boolean,
        randomSeedOverride: Long,
    ): Int

    external fun bbEngineFree(handle: Int)
    external fun bbGetView(handle: Int, outPtr: Long, outCap: Int): Int
    external fun bbSubmit(
        handle: Int,
        inPtr: Long,
        inLen: Int,
        viewRevision: Int,
        outPtr: Long,
        outCap: Int,
    ): Int
    external fun bbSerialize(handle: Int, outPtr: Long, outCap: Int): Int
    external fun bbRestore(handle: Int, inPtr: Long, inLen: Int, outPtr: Long, outCap: Int): Int
    external fun bbLastError(outPtr: Long, outCap: Int): Int
    external fun bbLoadCatalog(handle: Int, inPtr: Long, inLen: Int): Int
    external fun bbLoadLibrary(handle: Int, inPtr: Long, inLen: Int): Int
    external fun bbLoadChapter(handle: Int, inPtr: Long, inLen: Int): Int
    external fun bbUnloadChapter(handle: Int, inPtr: Long, inLen: Int): Int

    fun copyIntoRust(bytes: ByteArray): Copy {
        if (bytes.isEmpty()) {
            return Copy(0L, 0)
        }
        val ptr = bbAlloc(bytes.size)
        require(ptr != 0L) { "bb_alloc failed" }
        copyBytes(ptr, bytes)
        return Copy(ptr, bytes.size)
    }

    fun freeCopy(copy: Copy) {
        if (copy.ptr != 0L) {
            bbFree(copy.ptr, copy.len)
        }
    }

    private external fun copyBytes(ptr: Long, bytes: ByteArray)

    fun readLastError(): String = callWithOutput { outPtr, outCap ->
        bbLastError(outPtr, outCap)
    }

    fun callWithOutput(executor: (outPtr: Long, outCap: Int) -> Int): String {
        var cap = 4096
        while (cap <= 4 * 1024 * 1024) {
            val allocatedCap = cap
            val outPtr = bbAlloc(allocatedCap)
            require(outPtr != 0L) { "bb_alloc failed" }
            try {
                val written = executor(outPtr, allocatedCap)
                when {
                    written > 0 -> return decode(outPtr, written)
                    written < 0 -> cap = -written
                    else -> error(readLastError())
                }
            } finally {
                bbFree(outPtr, allocatedCap)
            }
        }
        error("blackbox output exceeded maximum buffer size")
    }

    fun callWithUtf8Input(
        input: String,
        executor: (inPtr: Long, inLen: Int, outPtr: Long, outCap: Int) -> Int,
    ): String {
        val bytes = input.toByteArray(Charsets.UTF_8)
        val copy = copyIntoRust(bytes)
        try {
            return callWithOutput { outPtr, outCap ->
                executor(copy.ptr, copy.len, outPtr, outCap)
            }
        } finally {
            freeCopy(copy)
        }
    }

    fun callWithBytesInput(bytes: ByteArray, executor: (inPtr: Long, inLen: Int) -> Int) {
        val copy = copyIntoRust(bytes)
        try {
            if (executor(copy.ptr, copy.len) == 0) error(readLastError())
        } finally {
            freeCopy(copy)
        }
    }

    private external fun decode(ptr: Long, len: Int): String
}
