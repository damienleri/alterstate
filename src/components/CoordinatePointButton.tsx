import { Minus } from "lucide-react";
import { CoordinatePoint } from "./ImageCanvas";

interface CoordinatePointButtonProps {
  point: CoordinatePoint;
  index: number;
  position: { left: number; top: number };
  isHovered: boolean;
  imageWidth: number;
  imageHeight: number;
  canvasWidth: number;
  onDelete: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
}

export function CoordinatePointButton({
  point,
  position,
  isHovered,
  imageWidth,
  imageHeight,
  canvasWidth,
  onDelete,
  onHover,
  onHoverEnd,
}: CoordinatePointButtonProps) {
  const markerRadius = Math.max(15, Math.min(imageWidth, imageHeight) * 0.02);
  const markerSize = markerRadius * 2;
  const fontSize = Math.max(12, Math.min(imageWidth, imageHeight) * 0.015);
  const scale = canvasWidth / imageWidth;
  const scaledMarkerSize = markerSize * scale;
  const scaledFontSize = fontSize * scale;

  return (
    <button
      data-point-button
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      className="absolute pointer-events-auto rounded-full shadow-lg transition-colors flex items-center justify-center"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        transform: "translate(-50%, -50%)",
        width: `${scaledMarkerSize}px`,
        height: `${scaledMarkerSize}px`,
        backgroundColor: isHovered ? "rgb(239, 68, 68)" : "rgba(59, 130, 246, 0.8)",
      }}
      title={isHovered ? "Click to delete point" : `Point ${point.number}`}
    >
      {isHovered ? (
        <Minus
          className="text-white"
          style={{ width: `${scaledFontSize}px`, height: `${scaledFontSize}px` }}
        />
      ) : (
        <span className="text-white font-bold" style={{ fontSize: `${scaledFontSize}px` }}>
          {point.number}
        </span>
      )}
    </button>
  );
}

