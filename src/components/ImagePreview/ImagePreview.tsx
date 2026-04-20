import React, { useEffect, useState } from 'react';
import styles from './ImagePreview.module.css';

interface ImagePreviewProps {
  originalFile: File;
  processedUrl: string | null;
  downloadExtension?: string;
  onClear: () => void;
}

export default function ImagePreview({ originalFile, processedUrl, downloadExtension = 'png', onClear }: ImagePreviewProps) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(originalFile);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [originalFile]);

  return (
    <div className={styles.previewContainer}>
      <div className={styles.header}>
        <h2 className={styles.title}>Área de Trabalho</h2>
        <button className={styles.clearButton} onClick={onClear}>
          Começar de Novo
        </button>
      </div>

      <div className={`${styles.images} ${processedUrl ? styles.split : ''}`}>
        {/* Original Image */}
        <div className={styles.imageBox}>
          <span className={styles.imageLabel}>Original</span>
          <div className={styles.imageWrapper}>
            {originalUrl && (
              <img src={originalUrl} alt="Original" className={styles.image} />
            )}
          </div>
        </div>

        {/* Processed Image */}
        {processedUrl && (
          <div className={styles.imageBox}>
            <span className={styles.imageLabel}>Processada</span>
            <div className={styles.imageWrapper}>
              {downloadExtension === 'pdf' ? (
                 <iframe src={processedUrl} className={styles.image} style={{ border: 'none' }} />
              ) : (
                <img src={processedUrl} alt="Processed" className={styles.image} />
              )}
            </div>
            <a 
              href={processedUrl} 
              download={`imagem-convertida.${downloadExtension}`} 
              className={styles.downloadButton}
            >
              Baixar Imagem
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
