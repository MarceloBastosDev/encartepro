import React, { useState } from 'react';
import styles from './ConversionPanel.module.css';
import { convertFormat, removeBackground, OutputFormat } from '@/lib/imageProcessing';

interface ConversionPanelProps {
  blob: Blob;
  onProcessed: (url: string, extension: string) => void;
}

export default function ConversionPanel({ blob, onProcessed }: ConversionPanelProps) {
  const [format, setFormat] = useState<OutputFormat>('png');
  const [shouldRemoveBg, setShouldRemoveBg] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');

  const handleProcess = async () => {
    setIsProcessing(true);
    setProgressText('Processando...');
    
    try {
      let currentBlob: Blob = blob;

      if (shouldRemoveBg) {
        currentBlob = await removeBackground(blob, (msg) => setProgressText(msg));
      }

      setProgressText('Convertendo formato...');
      const result = await convertFormat(currentBlob, format);
      
      onProcessed(result.url, result.extension);
    } catch (error) {
      console.error(error);
      alert('Ocorreu um erro durante o processamento. Por favor, tente novamente.');
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFormat = e.target.value as OutputFormat;
    setFormat(newFormat);
    if (newFormat === 'jpeg' && shouldRemoveBg) {
      setShouldRemoveBg(false);
    }
  };

  const toggleRemoveBg = () => {
    const newValue = !shouldRemoveBg;
    setShouldRemoveBg(newValue);
    if (newValue && format === 'jpeg') {
      setFormat('png');
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.label}>Formato de Exportação</label>
          <select className={styles.select} value={format} onChange={handleFormatChange} disabled={isProcessing}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG (JPG)</option>
            <option value="webp">WEBP</option>
            <option value="gif">GIF</option>
            <option value="bmp">BMP</option>
            <option value="tiff">TIFF</option>
            <option value="svg">SVG</option>
            <option value="pdf">PDF</option>
            <option value="eps">EPS</option>
            <option value="ai">AI</option>
          </select>
        </div>

        <div className={styles.controlGroup}>
          <label className={styles.label}>Remoção de Fundo (IA)</label>
          <div 
            className={styles.toggleContainer} 
            onClick={!isProcessing ? toggleRemoveBg : undefined}
          >
            <div className={`${styles.toggle} ${shouldRemoveBg ? styles.active : ''}`}>
              <div className={styles.toggleHandle}></div>
            </div>
            <span>{shouldRemoveBg ? 'Ativado' : 'Desativado'}</span>
          </div>
        </div>
      </div>

      <button 
        className={styles.processButton} 
        onClick={handleProcess} 
        disabled={isProcessing}
      >
        {isProcessing ? (
          <>
            <div className={styles.spinner}></div>
            {progressText}
          </>
        ) : (
          'Converter Imagem'
        )}
      </button>
    </div>
  );
}
