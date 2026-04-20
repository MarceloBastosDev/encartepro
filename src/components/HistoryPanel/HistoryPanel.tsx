import React from 'react';
import styles from './HistoryPanel.module.css';

export interface HistoryItem {
  id: string;
  url: string;
  originalName: string;
  extension: string;
  timestamp: number;
}

interface HistoryPanelProps {
  items: HistoryItem[];
  onClearHistory: () => void;
  onDeleteItem: (id: string) => void;
}

export default function HistoryPanel({ items, onClearHistory, onDeleteItem }: HistoryPanelProps) {
  if (items.length === 0) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Histórico de Sessão</h2>
        <button className={styles.clearButton} onClick={onClearHistory}>
          Limpar Histórico
        </button>
      </div>

      <div className={styles.grid}>
        {items.map((item) => {
          const date = new Date(item.timestamp);
          const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          
          return (
            <div key={item.id} className={styles.card}>
              <div className={styles.imageWrapper}>
                <span className={styles.badge}>{item.extension}</span>
                {item.extension === 'pdf' ? (
                   <iframe src={item.url} className={styles.image} style={{ border: 'none', width: '100%', height: '100%' }} title={item.originalName} />
                ) : (
                  <img src={item.url} alt={item.originalName} className={styles.image} />
                )}
              </div>
              <div className={styles.info}>
                <span className={styles.filename} title={item.originalName}>
                  {item.originalName}
                </span>
                <span className={styles.timestamp}>Convertido às {timeString}</span>
                
                <div className={styles.actions}>
                  <a 
                    href={item.url} 
                    download={`convertido_${item.originalName.split('.')[0]}.${item.extension}`} 
                    className={styles.downloadButton}
                  >
                    Baixar
                  </a>
                  <button 
                    className={styles.deleteButton} 
                    onClick={() => onDeleteItem(item.id)}
                    title="Remover"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
