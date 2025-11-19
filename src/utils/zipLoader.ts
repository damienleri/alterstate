import JSZip from "jszip";

export interface UnzippedAssets {
  objUrl: string | null;
  mtlUrl: string | null;
  textures: Record<string, string>; // filename -> blobUrl
}

export async function unzipAndGetAssets(file: File): Promise<UnzippedAssets> {
  const zip = new JSZip();
  await zip.loadAsync(file);
  
  const assets: UnzippedAssets = {
    objUrl: null,
    mtlUrl: null,
    textures: {},
  };

  const promises: Promise<void>[] = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;

    const lowerName = zipEntry.name.toLowerCase();
    
    // Handle OBJ
    if (lowerName.endsWith(".obj")) {
      promises.push(
        zipEntry.async("blob").then((blob) => {
          assets.objUrl = URL.createObjectURL(blob);
        })
      );
    }
    // Handle MTL
    else if (lowerName.endsWith(".mtl")) {
      promises.push(
        zipEntry.async("blob").then((blob) => {
          assets.mtlUrl = URL.createObjectURL(blob);
        })
      );
    }
    // Handle Images (Textures)
    else if (
      lowerName.endsWith(".jpg") || 
      lowerName.endsWith(".jpeg") || 
      lowerName.endsWith(".png")
    ) {
      promises.push(
        zipEntry.async("blob").then((blob) => {
          // We store the filename (without path) as the key
          // because MTL files usually reference textures by filename
          const filename = relativePath.split('/').pop() || relativePath;
          assets.textures[filename] = URL.createObjectURL(blob);
        })
      );
    }
  });

  await Promise.all(promises);
  return assets;
}
