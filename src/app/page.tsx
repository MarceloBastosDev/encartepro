"use client";

import { useState } from "react";
import styles from "./page.module.css";
import ImageUploader from "@/components/ImageUploader/ImageUploader";
import ConversionPanel from "@/components/ConversionPanel/ConversionPanel";
import ImagePreview from "@/components/ImagePreview/ImagePreview";
import ImageEditor, { EditorSettings } from "@/components/ImageEditor/ImageEditor";
import ProductSearch from "@/components/ProductSearch/ProductSearch";

import heic2any from 'heic2any';
import HistoryPanel, { HistoryItem } from "@/components/HistoryPanel/HistoryPanel";

type Tab = "busca" | "editor";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("busca");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [downloadExt, setDownloadExt] = useState<string>('png');
  const [isPreparingHeic, setIsPreparingHeic] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Chamado quando o usuário clica em um produto na busca
  const handleSelectProduct = (file: File, _title: string) => {
    setEditedBlob(null);
    setProcessedImageUrl(null);
    setSelectedFile(file);
    setActiveTab("editor"); // muda para a aba do editor automaticamente
  };

  const handleFileSelect = async (file: File) => {
    setEditedBlob(null);
    setProcessedImageUrl(null);

    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

    if (isHeic) {
      setIsPreparingHeic(true);
      try {
        const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
        const convertedFile = new File([finalBlob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' });
        setSelectedFile(convertedFile);
      } catch (error) {
        console.error("HEIC Conversion error:", error);
        alert("Ocorreu um erro ao processar o arquivo HEIC.");
      } finally {
        setIsPreparingHeic(false);
      }
    } else {
      setSelectedFile(file);
    }
  };

  const handleEditorSave = (blob: Blob, _settings: EditorSettings) => {
    setEditedBlob(blob);
  };

  const handleEditorCancel = () => {
    setSelectedFile(null);
  };

  const handleClear = () => {
    setSelectedFile(null);
    setEditedBlob(null);
    setProcessedImageUrl(null);
  };

  const handleClearHistory = () => {
    history.forEach(item => URL.revokeObjectURL(item.url));
    setHistory([]);
  };

  const handleDeleteHistoryItem = (id: string) => {
    const item = history.find(i => i.id === id);
    if (item) URL.revokeObjectURL(item.url);
    setHistory(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Encarte<span>Pro</span>
        </h1>
        <p className={styles.subtitle}>
          Busque produtos, edite imagens e remova fundos com IA — tudo para os seus encartes de supermercado.
        </p>
      </header>

      {/* Abas */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "busca" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("busca")}
        >
          🔍 Buscar Produtos
        </button>
        <button
          className={`${styles.tab} ${activeTab === "editor" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("editor")}
        >
          🖼️ Editor de Imagem
        </button>
      </div>

      <main className={styles.mainContent}>

        {/* ── Aba de busca ── */}
        {activeTab === "busca" && (
          <div className={`${styles.appCard} ${styles.wideCard}`}>
            <ProductSearch onSelectImage={handleSelectProduct} />
          </div>
        )}

        {/* ── Aba do editor ── */}
        {activeTab === "editor" && (
          <>
            <div className={styles.appCard}>
              {isPreparingHeic ? (
                <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                  <div className={styles.spinner} style={{ margin: '0 auto 1rem auto', borderColor: 'var(--text-secondary)', borderTopColor: 'var(--primary-color)' }} />
                  <p>Processando formato HEIC do iPhone...</p>
                </div>
              ) : !selectedFile ? (
                <ImageUploader onFileSelect={handleFileSelect} />
              ) : !editedBlob ? (
                <ImageEditor
                  originalFile={selectedFile}
                  onSave={handleEditorSave}
                  onCancel={handleEditorCancel}
                />
              ) : (
                <div className={styles.workspace}>
                  <ImagePreview
                    originalFile={new File([editedBlob], selectedFile?.name || "edited-image.png", { type: editedBlob.type })}
                    processedUrl={processedImageUrl}
                    downloadExtension={downloadExt}
                    onClear={handleClear}
                  />
                  <ConversionPanel
                    blob={editedBlob}
                    onProcessed={(url, ext) => {
                      setProcessedImageUrl(url);
                      setDownloadExt(ext);
                      const newItem: HistoryItem = {
                        id: Date.now().toString(),
                        url,
                        originalName: selectedFile?.name || 'imagem',
                        extension: ext,
                        timestamp: Date.now()
                      };
                      setHistory(prev => [newItem, ...prev]);
                    }}
                  />
                </div>
              )}
            </div>

            <HistoryPanel
              items={history}
              onClearHistory={handleClearHistory}
              onDeleteItem={handleDeleteHistoryItem}
            />
          </>
        )}
      </main>
    </div>
  );
}
