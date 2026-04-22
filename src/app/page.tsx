"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import styles from "./page.module.css";
import ImageUploader from "@/components/ImageUploader/ImageUploader";
import ImagePreview from "@/components/ImagePreview/ImagePreview";
import ProductSearch from "@/components/ProductSearch/ProductSearch";
import HistoryPanel, { HistoryItem } from "@/components/HistoryPanel/HistoryPanel";

// Carregados só no browser — usam window/WebAssembly e quebram o SSR
import type { EditorSettings } from "@/components/ImageEditor/ImageEditor";
const ImageEditor     = dynamic(() => import("@/components/ImageEditor/ImageEditor"),     { ssr: false });
const ConversionPanel = dynamic(() => import("@/components/ConversionPanel/ConversionPanel"), { ssr: false });

type Tab = "busca" | "editor";

export default function Home() {
  const [activeTab, setActiveTab]             = useState<Tab>("busca");
  const [selectedFile, setSelectedFile]       = useState<File | null>(null);
  const [editedBlob, setEditedBlob]           = useState<Blob | null>(null);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [downloadExt, setDownloadExt]         = useState<string>('png');
  const [isPreparingHeic, setIsPreparingHeic] = useState(false);
  const [history, setHistory]                 = useState<HistoryItem[]>([]);

  const goToBusca = () => setActiveTab("busca");

  const handleSelectProduct = (file: File, _title: string) => {
    setEditedBlob(null);
    setProcessedImageUrl(null);
    setSelectedFile(file);
    setActiveTab("editor");
  };

  const handleFileSelect = async (file: File) => {
    setEditedBlob(null);
    setProcessedImageUrl(null);
    const isHeic = /\.hei[cf]$/i.test(file.name);
    if (isHeic) {
      setIsPreparingHeic(true);
      try {
        const heic2any = (await import('heic2any')).default;
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        setSelectedFile(new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' }));
      } catch { alert("Ocorreu um erro ao processar o arquivo HEIC."); }
      finally { setIsPreparingHeic(false); }
    } else {
      setSelectedFile(file);
    }
  };

  const handleEditorSave   = (blob: Blob, _s: EditorSettings) => setEditedBlob(blob);
  const handleEditorCancel = () => setSelectedFile(null);
  const handleClear        = () => { setSelectedFile(null); setEditedBlob(null); setProcessedImageUrl(null); };

  const handleClearHistory      = () => { history.forEach(i => URL.revokeObjectURL(i.url)); setHistory([]); };
  const handleDeleteHistoryItem = (id: string) => {
    const item = history.find(i => i.id === id);
    if (item) URL.revokeObjectURL(item.url);
    setHistory(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Encarte<span>Pro</span></h1>
        <p className={styles.subtitle}>
          Busque produtos, edite imagens e remova fundos com IA — tudo para os seus encartes de supermercado.
        </p>
      </header>

      {/* Abas */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "busca" ? styles.tabActive : ""}`}
          onClick={goToBusca}
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

        {/* ── Aba de busca — sempre montada para preservar os resultados ── */}
        <div
          className={`${styles.appCard} ${styles.wideCard}`}
          style={{ display: activeTab === "busca" ? undefined : "none" }}
        >
          <ProductSearch onSelectImage={handleSelectProduct} />
        </div>

        {/* ── Aba do editor ── */}
        {activeTab === "editor" && (
          <>
            {/* Botão de voltar para a busca */}
            <button className={styles.backBtn} onClick={goToBusca}>
              ← Voltar para a busca
            </button>

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
                  <button
                    className={styles.backBtnInline}
                    onClick={() => setEditedBlob(null)}
                  >
                    ← Voltar para edição
                  </button>
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
                      setHistory(prev => [{
                        id: Date.now().toString(),
                        url,
                        originalName: selectedFile?.name || 'imagem',
                        extension: ext,
                        timestamp: Date.now(),
                      }, ...prev]);
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
