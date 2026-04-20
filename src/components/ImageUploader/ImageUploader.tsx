import React, { useCallback, useRef } from 'react';
import styles from './ImageUploader.module.css';

interface ImageUploaderProps {
  onFileSelect: (file: File) => void;
}

export default function ImageUploader({ onFileSelect }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValidImage = (file: File) =>
    file.type.startsWith('image/') ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (isValidImage(file)) onFileSelect(file);
      else alert('Por favor, faça upload de um arquivo de imagem válido (incluindo HEIC).');
    }
  }, [onFileSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (isValidImage(file)) onFileSelect(file);
      else alert('Por favor, faça upload de um arquivo de imagem válido (incluindo HEIC).');
    }
  }, [onFileSelect]);

  return (
    <div
      className={`${styles.dropzone} ${isDragging ? styles.active : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        className={styles.fileInput}
        accept="image/*,.heic,.heif"
        onChange={handleFileChange}
      />
      <div className={styles.icon}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
      </div>
      <div className={styles.text}>Arraste & Solte sua imagem aqui</div>
      <div className={styles.subtext}>ou clique para buscar no seu computador</div>
    </div>
  );
}
