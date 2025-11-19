import { useState, useRef, ChangeEvent } from "react";
import { Camera, Wand2, RotateCcw, Download } from "lucide-react";
import RoomViewer, { RoomViewerHandle } from "./RoomViewer";
import FileUpload from "./FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { unzipAndGetAssets, UnzippedAssets } from "@/utils/zipLoader";

export default function RedesignInterface() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [assets, setAssets] = useState<UnzippedAssets | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const viewerRef = useRef<RoomViewerHandle>(null);

  const handleFileSelect = async (file: File) => {
    if (file.name.toLowerCase().endsWith('.zip')) {
      setIsProcessing(true);
      try {
        const extractedAssets = await unzipAndGetAssets(file);
        setAssets(extractedAssets);
        setFileUrl(null); // Clear direct URL if using assets
      } catch (e) {
        console.error("Failed to unzip:", e);
        alert("Failed to process ZIP file.");
      } finally {
        setIsProcessing(false);
      }
    } else {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      setAssets(null);
    }
  };

  const handleCapture = () => {
    if (viewerRef.current) {
      const image = viewerRef.current.captureSnapshot();
      if (image) {
        setSnapshot(image);
        setResultImage(null); // Reset result when new snapshot is taken
      }
    }
  };

  const handleGenerate = async () => {
    if (!snapshot || !prompt) return;
    
    setIsGenerating(true);
    
    // Mock API call
    setTimeout(() => {
      // For demo purposes, we just use the snapshot as the "result" 
      // but in a real app this would be the AI output
      setResultImage(snapshot); 
      setIsGenerating(false);
    }, 2000);
  };

  const handleReset = () => {
    setFileUrl(null);
    setAssets(null);
    setSnapshot(null);
    setResultImage(null);
    setPrompt("");
  };

  if (!fileUrl && !assets) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Redesign Your Room</h1>
          <p className="text-neutral-500">Upload a 3D scan (.obj) to get started.</p>
        </div>
        <FileUpload onFileSelect={handleFileSelect} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" />
          </Button>
          <h2 className="font-semibold">Room Editor</h2>
        </div>
        <div className="flex items-center gap-2">
           {/* Toolbar actions could go here */}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: 3D View */}
        <div className="flex-1 relative border-r bg-neutral-100">
          {isProcessing ? (
            <div className="w-full h-full flex items-center justify-center text-neutral-500">
              Processing ZIP file...
            </div>
          ) : (
            <RoomViewer ref={viewerRef} fileUrl={fileUrl} assets={assets} />
          )}
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <Button onClick={handleCapture} size="lg" className="shadow-lg">
              <Camera className="w-4 h-4 mr-2" />
              Capture View
            </Button>
          </div>
        </div>

        {/* Right Panel: Editor */}
        <div className="w-[400px] bg-white flex flex-col overflow-y-auto">
          <div className="p-6 space-y-6">
            
            {/* Step 1: Snapshot */}
            <div className="space-y-3">
              <Label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                1. Current View
              </Label>
              <div className="aspect-video bg-neutral-100 rounded-lg overflow-hidden border relative">
                {snapshot ? (
                  <img src={snapshot} alt="Snapshot" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-400 text-sm">
                    No snapshot taken
                  </div>
                )}
              </div>
              <p className="text-xs text-neutral-500">
                Position the camera in the 3D view and click "Capture View".
              </p>
            </div>

            <Separator />

            {/* Step 2: Prompt */}
            <div className="space-y-3">
              <Label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                2. Describe Changes
              </Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="e.g., Change countertop to white marble" 
                  value={prompt}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPrompt(e.target.value)}
                  disabled={!snapshot}
                />
              </div>
            </div>

            {/* Action */}
            <Button 
              className="w-full" 
              size="lg" 
              disabled={!snapshot || !prompt || isGenerating}
              onClick={handleGenerate}
            >
              {isGenerating ? (
                <>Generating...</>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Redesign Room
                </>
              )}
            </Button>

            {/* Result */}
            {resultImage && (
              <>
                <Separator />
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4">
                  <Label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                    Result
                  </Label>
                  <div className="aspect-video bg-neutral-100 rounded-lg overflow-hidden border shadow-sm">
                    <img src={resultImage} alt="Result" className="w-full h-full object-cover" />
                  </div>
                  <Button variant="outline" className="w-full" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Save Image
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
