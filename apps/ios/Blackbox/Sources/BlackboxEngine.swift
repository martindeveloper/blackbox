import Foundation

public enum BlackboxEngineError: Error, LocalizedError {
    case allocFailed
    case engineCreateFailed(String)
    case callFailed(String)
    case outputTooLarge

    public var errorDescription: String? {
        switch self {
        case .allocFailed:
            return "blackbox bb_alloc failed"
        case .engineCreateFailed(let message):
            return message
        case .callFailed(let message):
            return message
        case .outputTooLarge:
            return "blackbox output exceeded maximum buffer size"
        }
    }
}

public final class BlackboxEngine {
    private let handle: UInt32

    public static func initialize() {
        bb_init()
    }

    public init(
        scenario: Data,
        items: Data,
        characters: Data,
        assets: Data,
        chapters: [Data],
        library: Data? = nil,
        randomSeedOverride: UInt64? = nil
    ) throws {
        let scenarioPtr = try Self.copyIntoRust(scenario)
        let itemsPtr = try Self.copyIntoRust(items)
        let charactersPtr = try Self.copyIntoRust(characters)
        let assetsPtr = try Self.copyIntoRust(assets)
        let libraryPtr = try Self.copyIntoRust(library ?? Data())

        var chapterSlices = [ByteSlice]()
        var chapterPtrs: [(ptr: Int, len: UInt32)] = []
        for chapter in chapters {
            let copied = try Self.copyIntoRust(chapter)
            chapterPtrs.append((copied.ptr, copied.len))
            chapterSlices.append(ByteSlice(ptr: copied.ptr, len: copied.len))
        }

        let tablePtr: Int
        if chapterSlices.isEmpty {
            tablePtr = 0
        } else {
            tablePtr = try chapterSlices.withUnsafeBytes { raw in
                let len = UInt32(raw.count)
                let ptr = bb_alloc(len)
                guard ptr != 0 else {
                    throw BlackboxEngineError.allocFailed
                }
                memcpy(UnsafeMutableRawPointer(bitPattern: ptr)!, raw.baseAddress!, raw.count)
                return ptr
            }
        }

        defer {
            Self.freeCopy(scenarioPtr)
            Self.freeCopy(itemsPtr)
            Self.freeCopy(charactersPtr)
            Self.freeCopy(assetsPtr)
            Self.freeCopy(libraryPtr)
            for copied in chapterPtrs {
                bb_free(copied.ptr, copied.len)
            }
            if tablePtr != 0 {
                bb_free(tablePtr, UInt32(MemoryLayout<ByteSlice>.stride * chapterSlices.count))
            }
        }

        let created = bb_engine_new(
            scenarioPtr.ptr,
            scenarioPtr.len,
            itemsPtr.ptr,
            itemsPtr.len,
            charactersPtr.ptr,
            charactersPtr.len,
            assetsPtr.ptr,
            assetsPtr.len,
            tablePtr,
            UInt32(chapters.count),
            libraryPtr.ptr,
            libraryPtr.len,
            randomSeedOverride != nil,
            randomSeedOverride ?? 0
        )

        guard created != 0 else {
            throw BlackboxEngineError.engineCreateFailed(Self.readLastError())
        }
        handle = created
    }

    deinit {
        bb_engine_free(handle)
    }

    public func getCurrentView() throws -> String {
        try String(decoding: callWithOutput { outPtr, outCap in
            bb_get_view(handle, outPtr, outCap)
        }, as: UTF8.self)
    }

    public func submitCommand(_ json: String, viewRevision: UInt32) throws -> String {
        try String(decoding: callWithUtf8Input(json) { inPtr, inLen, outPtr, outCap in
            bb_submit(handle, inPtr, inLen, viewRevision, outPtr, outCap)
        }, as: UTF8.self)
    }

    public func loadCatalog(_ data: Data) throws {
        try callWithDataInput(data) { inPtr, inLen in
            bb_load_catalog(handle, inPtr, inLen)
        }
    }

    public func loadLibrary(_ data: Data) throws {
        try callWithDataInput(data) { inPtr, inLen in
            bb_load_library(handle, inPtr, inLen)
        }
    }

    public func loadChapter(_ data: Data) throws {
        try callWithDataInput(data) { inPtr, inLen in
            bb_load_chapter(handle, inPtr, inLen)
        }
    }

    public func unloadChapter(_ chapterId: String) throws {
        try callWithDataInput(Data(chapterId.utf8)) { inPtr, inLen in
            bb_unload_chapter(handle, inPtr, inLen)
        }
    }

    public func serializeState() throws -> String {
        try String(decoding: callWithOutput { outPtr, outCap in
            bb_serialize(handle, outPtr, outCap)
        }, as: UTF8.self)
    }

    public func restoreState(_ json: String) throws -> String {
        try String(decoding: callWithUtf8Input(json) { inPtr, inLen, outPtr, outCap in
            bb_restore(handle, inPtr, inLen, outPtr, outCap)
        }, as: UTF8.self)
    }

    private struct Copy {
        let ptr: Int
        let len: UInt32
    }

    private static func copyIntoRust(_ data: Data) throws -> Copy {
        let len = UInt32(data.count)
        guard len > 0 else {
            return Copy(ptr: 0, len: 0)
        }
        let ptr = bb_alloc(len)
        guard ptr != 0 else {
            throw BlackboxEngineError.allocFailed
        }
        _ = data.withUnsafeBytes { raw in
            memcpy(UnsafeMutableRawPointer(bitPattern: ptr)!, raw.baseAddress!, raw.count)
        }
        return Copy(ptr: ptr, len: len)
    }

    private static func freeCopy(_ copy: Copy) {
        if copy.ptr != 0 {
            bb_free(copy.ptr, copy.len)
        }
    }

    private static func readLastError() -> String {
        var cap: UInt32 = 512
        while cap <= 65_536 {
            let allocatedCap = cap
            let ptr = bb_alloc(allocatedCap)
            guard ptr != 0 else {
                return "bb_alloc failed while reading last error"
            }
            defer { bb_free(ptr, allocatedCap) }
            let written = bb_last_error(ptr, allocatedCap)
            if written > 0 {
                let bytes = Data(bytes: UnsafeRawPointer(bitPattern: ptr)!, count: Int(written))
                return String(decoding: bytes, as: UTF8.self)
            }
            if written < 0 {
                cap = UInt32(-written)
                continue
            }
            return "unknown blackbox error"
        }
        return "blackbox error message exceeded buffer limit"
    }

    private func callWithOutput(
        _ executor: (_ outPtr: Int, _ outCap: UInt32) -> Int32
    ) throws -> Data {
        var cap: UInt32 = 4096
        while cap <= 4 * 1024 * 1024 {
            let allocatedCap = cap
            let outPtr = bb_alloc(allocatedCap)
            guard outPtr != 0 else {
                throw BlackboxEngineError.allocFailed
            }
            defer { bb_free(outPtr, allocatedCap) }
            let written = executor(outPtr, allocatedCap)
            if written > 0 {
                return Data(bytes: UnsafeRawPointer(bitPattern: outPtr)!, count: Int(written))
            }
            if written < 0 {
                cap = UInt32(-written)
                continue
            }
            throw BlackboxEngineError.callFailed(Self.readLastError())
        }
        throw BlackboxEngineError.outputTooLarge
    }

    private func callWithUtf8Input(
        _ input: String,
        _ executor: (_ inPtr: Int, _ inLen: UInt32, _ outPtr: Int, _ outCap: UInt32) -> Int32
    ) throws -> Data {
        let copied = try Self.copyIntoRust(Data(input.utf8))
        defer { Self.freeCopy(copied) }
        return try callWithOutput { outPtr, outCap in
            executor(copied.ptr, copied.len, outPtr, outCap)
        }
    }

    private func callWithDataInput(
        _ input: Data,
        _ executor: (_ inPtr: Int, _ inLen: UInt32) -> Int32
    ) throws {
        let copied = try Self.copyIntoRust(input)
        defer { Self.freeCopy(copied) }
        guard executor(copied.ptr, copied.len) != 0 else {
            throw BlackboxEngineError.callFailed(Self.readLastError())
        }
    }
}
