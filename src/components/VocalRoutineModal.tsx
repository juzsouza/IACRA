import React, { useState } from 'react';
import { X, Printer, Send, Edit3, Check, FileText } from 'lucide-react';

interface VocalRoutineModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  studentPhone?: string;
  date: string; // e.g. "2026-08-06" or "06/08/2026"
  vocalRoutine: string;
  onSaveRoutine?: (newRoutine: string) => void;
}

export const VocalRoutineModal: React.FC<VocalRoutineModalProps> = ({
  isOpen,
  onClose,
  studentName,
  studentPhone,
  date,
  vocalRoutine,
  onSaveRoutine,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentText, setCurrentText] = useState(vocalRoutine || '');

  if (!isOpen) return null;

  // Format date display (DD/MM/YYYY)
  const formattedDate = (() => {
    if (!date) return new Date().toLocaleDateString('pt-BR');
    if (date.includes('-')) {
      const parts = date.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return date;
  })();

  const handleSave = () => {
    setIsEditing(false);
    if (onSaveRoutine) {
      onSaveRoutine(currentText);
    }
  };

  const handlePrintPDFOnly = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permita pop-ups para gerar o PDF de impressão.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Treino - ${studentName}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: Calibri, 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
          }
          body {
            background-color: #ffffff;
            color: #1a1a1a;
            display: flex;
            justify-content: center;
            padding: 0;
          }
          .sheet {
            width: 100%;
            max-width: 190mm;
            min-height: 270mm;
            border: 5px solid #196383;
            padding: 24px;
            display: flex;
            flex-direction: column;
            background-color: #f7f7f8;
            box-shadow: none;
          }
          .header-top {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 12px;
            text-align: center;
          }
          .brand-titles {
            text-align: center;
          }
          .brand-subtitle {
            font-size: 11px;
            letter-spacing: 2.5px;
            color: #196383;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 2px;
          }
          .brand-name {
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 28px;
            color: #196383;
            font-weight: 700;
            line-height: 1.1;
          }
          .contacts-bar {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
            margin-bottom: 18px;
            font-size: 12px;
            font-weight: 600;
            color: #196383;
          }
          .contact-item {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .info-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #ffffff;
            border: 1px solid #196383;
            border-radius: 6px;
            padding: 10px 16px;
            margin-bottom: 16px;
            font-size: 15px;
            color: #000000;
          }
          .info-item {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .info-label {
            font-weight: 700;
            color: #196383;
            text-transform: uppercase;
            font-size: 13px;
          }
          .info-value {
            font-weight: 800;
            color: #000000;
          }
          .content-box {
            flex: 1;
            border: 2px solid #000000;
            background-color: #ffffff;
            padding: 24px;
            font-family: Calibri, 'Segoe UI', Arial, sans-serif;
            font-size: 20px;
            line-height: 1.5;
            white-space: pre-wrap;
            color: #111111;
            font-weight: 500;
            min-height: 520px;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="header-top">
            <div class="brand-titles">
              <div class="brand-subtitle">Instituto de Arte Cristã</div>
              <div class="brand-name">Raphael Augusto</div>
            </div>
          </div>

          <div class="contacts-bar">
            <div class="contact-item">📞 (18) 99707-4048</div>
            <div class="contact-item">📍 Rua Joaquim Nabuco, 1040</div>
          </div>

          <div class="info-box">
            <div class="info-item">
              <span class="info-label">Aluno:</span>
              <span class="info-value">${studentName}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Data:</span>
              <span class="info-value">${formattedDate}</span>
            </div>
          </div>

          <div class="content-box">${currentText || 'Nenhum treino inserido.'}</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handlePrintPDFAndWhatsApp = () => {
    handlePrintPDFOnly();
    setTimeout(() => {
      handleSendWhatsApp();
    }, 500);
  };

  const handleSendWhatsApp = () => {
    const cleanPhone = (studentPhone || '').replace(/\D/g, '');
    const message = `Olá, *${studentName}*! 🎵\n\nSegue o seu treino referente à aula de *${formattedDate}*:\n\n━━━━━━━━━━━━━━━━━━━━\n${currentText || 'Treino agendado.'}\n━━━━━━━━━━━━━━━━━━━━\n\n_Instituto de Arte Cristã Raphael Augusto_\n📞 (18) 99707-4048 | 📍 Rua Joaquim Nabuco, 1040`;

    const encodedMsg = encodeURIComponent(message);
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodedMsg}`
      : `https://api.whatsapp.com/send?text=${encodedMsg}`;

    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden my-8 border border-zinc-100 flex flex-col max-h-[90vh]">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 bg-zinc-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-teal-400" />
            <h3 className="font-bold text-lg">Treino do Aluno</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Actions Bar */}
        <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-200 flex flex-wrap gap-2 items-center justify-between shrink-0">
          <div className="text-xs text-zinc-500 font-medium">
            Aluno: <strong className="text-zinc-800">{studentName}</strong> • Data: <strong className="text-zinc-800">{formattedDate}</strong>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isEditing ? (
              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                Salvar Texto
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg transition-colors flex items-center"
              >
                <Edit3 className="w-3.5 h-3.5 mr-1 text-zinc-500" />
                Editar Treino
              </button>
            )}

            <button
              type="button"
              onClick={handlePrintPDFOnly}
              title="Gerar e Salvar PDF no computador/celular"
              className="px-3 py-1.5 text-xs font-bold text-teal-800 bg-teal-100 hover:bg-teal-200 border border-teal-200 rounded-lg transition-colors shadow-xs flex items-center"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Gerar PDF
            </button>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              title="Enviar texto do treino via WhatsApp"
              className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-200 rounded-lg transition-colors shadow-xs flex items-center"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Whats (Texto)
            </button>

            <button
              type="button"
              onClick={handlePrintPDFAndWhatsApp}
              title="Gerar o PDF para salvar e abrir a conversa no WhatsApp"
              className="px-3 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors shadow-sm flex items-center"
            >
              <Printer className="w-3.5 h-3.5 mr-1 text-teal-200" />
              + <Send className="w-3.5 h-3.5 ml-1 mr-1.5" />
              PDF + Whats
            </button>
          </div>
        </div>

        {/* Info Banner on WhatsApp PDF Behavior */}
        <div className="px-6 py-2 bg-amber-50/80 border-b border-amber-200/60 text-[11px] text-amber-900 flex items-center gap-2">
          <span className="font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded shrink-0">Dica:</span>
          <span>
            Os links da web não permitem anexar arquivos PDF automaticamente no WhatsApp.
            Use <strong>Gerar PDF</strong> para salvar o arquivo no seu dispositivo e anexá-lo na conversa do WhatsApp.
          </span>
        </div>

        {/* Printable Sheet View Area */}
        <div className="p-6 overflow-y-auto bg-zinc-100/80 flex-1 flex justify-center">
          <div className="w-full max-w-[650px] bg-white border-[5px] border-[#196383] p-6 shadow-md rounded-none flex flex-col font-sans text-zinc-900 my-auto">
            {/* Header Brand */}
            <div className="flex items-center justify-center mb-3 text-center">
              <div>
                <div className="text-[10px] tracking-[2.5px] uppercase text-[#196383] font-bold">Instituto de Arte Cristã</div>
                <div className="text-2xl font-serif font-bold text-[#196383] leading-tight">Raphael Augusto</div>
              </div>
            </div>

            {/* Contacts Bar */}
            <div className="flex justify-center items-center gap-4 mb-4 text-[11px] font-semibold text-[#196383]">
              <span>📞 (18) 99707-4048</span>
              <span>📍 Rua Joaquim Nabuco, 1040</span>
            </div>

            {/* Student Info Box */}
            <div className="flex justify-between items-center bg-white border border-[#196383] rounded-md px-4 py-2 mb-4 text-sm">
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-[#196383] uppercase text-xs">Aluno:</span>
                <span className="font-extrabold text-black">{studentName}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-[#196383] uppercase text-xs">Data:</span>
                <span className="font-extrabold text-black">{formattedDate}</span>
              </div>
            </div>

            {/* Content Box */}
            <div className="flex-1 border-2 border-black bg-zinc-50 p-5 rounded-none min-h-[300px]">
              {isEditing ? (
                <textarea
                  value={currentText}
                  onChange={(e) => setCurrentText(e.target.value)}
                  placeholder="Escreva o treino do aluno aqui..."
                  style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif", fontSize: "20px" }}
                  className="w-full h-full min-h-[280px] p-2 bg-transparent font-medium outline-none resize-y border-0 focus:ring-0 leading-relaxed"
                />
              ) : (
                <div
                  style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif", fontSize: "20px" }}
                  className="whitespace-pre-wrap font-medium text-zinc-900 leading-relaxed"
                >
                  {currentText || (
                    <span className="text-zinc-400 italic text-base">
                      Nenhum treino cadastrado para esta aula. Clique em &quot;Editar Treino&quot; acima para digitar o treino do aluno.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
