// OCR every frame in a folder with macOS Vision and print one JSON line per frame:
// {"frame": "000123.png", "lines": [{"text": "...", "conf": 0.9, "x": .., "y": .., "w": .., "h": ..}]}
// Boxes are normalized, origin at the top left.
// Usage: swift ocr_frames.swift <frames-dir> [fast|accurate]
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write("usage: ocr_frames.swift <frames-dir> [fast|accurate]\n".data(using: .utf8)!)
    exit(2)
}
let dir = URL(fileURLWithPath: args[1])
let level: VNRequestTextRecognitionLevel = (args.count > 2 && args[2] == "accurate") ? .accurate : .fast

let files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    .filter { $0.hasSuffix(".png") || $0.hasSuffix(".jpg") }
    .sorted()

for name in files {
    guard let image = NSImage(contentsOf: dir.appendingPathComponent(name)),
          let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        FileHandle.standardError.write("cannot read \(name)\n".data(using: .utf8)!)
        continue
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = level
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = level == .accurate
    try VNImageRequestHandler(cgImage: cg).perform([request])

    let lines: [[String: Any]] = (request.results ?? []).compactMap { obs in
        guard let top = obs.topCandidates(1).first else { return nil }
        let b = obs.boundingBox
        return ["text": top.string, "conf": top.confidence,
                "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height]
    }
    let data = try JSONSerialization.data(withJSONObject: ["frame": name, "lines": lines])
    print(String(data: data, encoding: .utf8)!)
}
