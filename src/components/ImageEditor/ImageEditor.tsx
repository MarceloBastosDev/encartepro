import React, { useRef, useState, useEffect } from 'react';
import Cropper, { ReactCropperElement } from 'react-cropper';
import styles from './ImageEditor.module.css';

export interface EditorSettings {
  brightness: number;
  contrast: number;
  saturation: number;
}

interface ImageEditorProps {
  originalFile: File;
  onSave: (croppedBlob: Blob, settings: EditorSettings) => void;
  onCancel: () => void;
}

export default function ImageEditor({ originalFile, onSave, onCancel }: ImageEditorProps) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  
  // Aspect Ratio State
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined);
  
  // Transform State
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);

  // Filters State
  const [settings, setSettings] = useState<EditorSettings>({
    brightness: 100,
    contrast: 100,
    saturation: 100
  });

  useEffect(() => {
    const url = URL.createObjectURL(originalFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [originalFile]);

  const handleRotate = (degree: number) => {
    cropperRef.current?.cropper.rotate(degree);
  };

  const handleFlipX = () => {
    const newScale = scaleX === 1 ? -1 : 1;
    setScaleX(newScale);
    cropperRef.current?.cropper.scaleX(newScale);
  };

  const handleFlipY = () => {
    const newScale = scaleY === 1 ? -1 : 1;
    setScaleY(newScale);
    cropperRef.current?.cropper.scaleY(newScale);
  };

  const handleApply = () => {
    if (typeof cropperRef.current?.cropper !== 'undefined') {
      const croppedCanvas = cropperRef.current?.cropper.getCroppedCanvas();
      if (!croppedCanvas) return;
      
      // Bake the CSS filters into a new canvas
      const canvas = document.createElement('canvas');
      canvas.width = croppedCanvas.width;
      canvas.height = croppedCanvas.height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%)`;
        ctx.drawImage(croppedCanvas, 0, 0);
      }
      
      canvas.toBlob((blob) => {
        if (blob) {
          onSave(blob, settings);
        }
      }, originalFile.type || 'image/png', 1);
    }
  };

  // Generate CSS filter string for preview
  const filterStyle = `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%)`;

  const handleAspectRatioChange = (ratio: number | undefined) => {
    setAspectRatio(ratio);
    if (cropperRef.current?.cropper) {
      cropperRef.current.cropper.setAspectRatio(ratio === undefined ? NaN : ratio);
    }
  };

  return (
    <div className={styles.editorContainer}>
      <div className={styles.cropperWrapper}>
        {imageUrl && (
          <Cropper
            src={imageUrl}
            style={{ height: '100%', width: '100%', filter: filterStyle }}
            initialAspectRatio={NaN}
            aspectRatio={aspectRatio}
            guides={true}
            ref={cropperRef}
            viewMode={1}
            dragMode="crop"
            background={false}
            responsive={true}
            checkOrientation={false}
          />
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <span className={styles.label}>Proporção:</span>
          <button 
            className={`${styles.button} ${aspectRatio === undefined ? styles.active : ''}`} 
            onClick={() => handleAspectRatioChange(undefined)}
          >Livre</button>
          <button 
            className={`${styles.button} ${aspectRatio === 1 ? styles.active : ''}`} 
            onClick={() => handleAspectRatioChange(1)}
          >1:1</button>
          <button 
            className={`${styles.button} ${aspectRatio === 4/3 ? styles.active : ''}`} 
            onClick={() => handleAspectRatioChange(4/3)}
          >4:3</button>
          <button 
            className={`${styles.button} ${aspectRatio === 16/9 ? styles.active : ''}`} 
            onClick={() => handleAspectRatioChange(16/9)}
          >16:9</button>
        </div>

        <div className={styles.controlGroup}>
          <button className={styles.iconButton} onClick={() => handleRotate(-90)} title="Rotacionar Esquerda">↺</button>
          <button className={styles.iconButton} onClick={() => handleRotate(90)} title="Rotacionar Direita">↻</button>
          <button className={styles.iconButton} onClick={handleFlipX} title="Inverter Horizontal">↔</button>
          <button className={styles.iconButton} onClick={handleFlipY} title="Inverter Vertical">↕</button>
        </div>
      </div>

      <div className={styles.sliderGroup}>
        <div className={styles.sliderRow}>
          <label>Brilho</label>
          <input 
            type="range" 
            min="0" max="200" 
            value={settings.brightness} 
            className={styles.slider}
            onChange={(e) => setSettings({...settings, brightness: Number(e.target.value)})}
          />
          <span className={styles.value}>{settings.brightness}%</span>
        </div>
        <div className={styles.sliderRow}>
          <label>Contraste</label>
          <input 
            type="range" 
            min="0" max="200" 
            value={settings.contrast} 
            className={styles.slider}
            onChange={(e) => setSettings({...settings, contrast: Number(e.target.value)})}
          />
          <span className={styles.value}>{settings.contrast}%</span>
        </div>
        <div className={styles.sliderRow}>
          <label>Saturação</label>
          <input 
            type="range" 
            min="0" max="200" 
            value={settings.saturation} 
            className={styles.slider}
            onChange={(e) => setSettings({...settings, saturation: Number(e.target.value)})}
          />
          <span className={styles.value}>{settings.saturation}%</span>
        </div>
      </div>

      <div className={styles.controlGroup} style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button className={styles.button} onClick={onCancel}>Cancelar</button>
        <button className={`${styles.button} ${styles.active}`} onClick={handleApply}>Concluir Edição</button>
      </div>
    </div>
  );
}
