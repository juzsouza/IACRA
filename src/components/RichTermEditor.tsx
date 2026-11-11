import React, {useCallback,useEffect,useRef} from 'react';
import {isRichTerm,richTermFromEditor,sanitizeTermHtml,termToSafeHtml} from '../utils/richTermMarkup';

type Props={value:string;onChange:(value:string)=>void;disabled?:boolean};

/** Built-in editor: format while typing; no external editor CDN or remote data. */
export function RichTermEditor({value,onChange,disabled=false}:Props):React.ReactElement{
 const editorRef=useRef<HTMLDivElement>(null);
 const lastValueRef=useRef('');
 const selectionRef=useRef<Range|null>(null);

 useEffect(()=>{
  const editor=editorRef.current;
  if(!editor || lastValueRef.current===value)return;
  editor.innerHTML=termToSafeHtml(value);
  lastValueRef.current=value;
 },[value]);

 const rememberSelection=useCallback(()=>{
  const selection=window.getSelection(),editor=editorRef.current;
  if(!selection || !selection.rangeCount || !editor)return;
  const range=selection.getRangeAt(0);
  if(editor.contains(range.commonAncestorContainer))selectionRef.current=range.cloneRange();
 },[]);

 const restoreFocus=()=>{
  const editor=editorRef.current;
  if(!editor)return false;
  editor.focus();
  if(selectionRef.current){
   try{
    const selection=window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(selectionRef.current);
   }catch{ /* Stale selection after editing: focus only. */ }
  }
  return true;
 };

 const emit=()=>{
  const editor=editorRef.current;
  if(!editor)return;
  const result=richTermFromEditor(editor.innerHTML);
  lastValueRef.current=result;
  onChange(result);
  rememberSelection();
 };

 const execute=(command:string,argument?:string)=>{
  if(disabled || !restoreFocus())return;
  document.execCommand(command,false,argument);
  emit();
 };
 const toolbarButton=(label:string,command:string,display:string,style?:React.CSSProperties)=>(
  <button key={command+label} type="button" title={label} aria-label={label} disabled={disabled}
    onMouseDown={event=>event.preventDefault()}
    onClick={()=>execute(command)}
    className="px-2.5 py-1.5 text-sm font-medium hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-indigo-500 rounded disabled:opacity-50"
    style={style}>{display}</button>
 );

 const paste=(event:React.ClipboardEvent<HTMLDivElement>)=>{
  event.preventDefault();
  const html=event.clipboardData.getData('text/html');
  const text=event.clipboardData.getData('text/plain');
  if(!restoreFocus())return;
  const safe=html?sanitizeTermHtml(html):text.replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/\r\n?|\n/g,'<br>');
  document.execCommand('insertHTML',false,safe);
  emit();
 };

 return <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white">
  <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-zinc-50 p-2" role="toolbar" aria-label="Formatar texto do termo">
   <select title="Fonte" aria-label="Fonte do termo" defaultValue="Arial" disabled={disabled}
     onChange={e=>execute('fontName',e.target.value)}
     className="border rounded px-2 py-1.5 text-sm bg-white">
    <option value="Arial">Arial</option>
    <option value="Georgia">Georgia</option>
    <option value="Times New Roman">Times New Roman</option>
   </select>
   <select title="Tamanho da fonte" aria-label="Tamanho da fonte" defaultValue="3" disabled={disabled}
     onChange={e=>execute('fontSize',e.target.value)}
     className="border rounded px-2 py-1.5 text-sm bg-white">
    <option value="1">Pequeno</option>
    <option value="2">12 px</option>
    <option value="3">Normal</option>
    <option value="4">16 px</option>
    <option value="5">18 px</option>
    <option value="6">22 px</option>
   </select>
   <span aria-hidden="true" className="h-6 border-l mx-1 border-zinc-300" />
   {toolbarButton('Negrito','bold','B',{fontWeight:800})}
   {toolbarButton('Itálico','italic','I',{fontStyle:'italic'})}
   {toolbarButton('Sublinhado','underline','U',{textDecoration:'underline'})}
   {toolbarButton('Riscado','strikeThrough','S',{textDecoration:'line-through'})}
   <label title="Cor do texto" className="inline-flex gap-1 items-center px-2 text-sm">
    Cor <input aria-label="Cor do texto" type="color" defaultValue="#20283e" disabled={disabled}
     onChange={e=>execute('foreColor',e.target.value)} className="h-7 w-7 rounded cursor-pointer"/>
   </label>
   <span aria-hidden="true" className="h-6 border-l mx-1 border-zinc-300"/>
   {toolbarButton('Alinhar à esquerda','justifyLeft','☰')}
   {toolbarButton('Centralizar','justifyCenter','≡')}
   {toolbarButton('Alinhar à direita','justifyRight','☷')}
   {toolbarButton('Justificar','justifyFull','▤')}
   <span aria-hidden="true" className="h-6 border-l mx-1 border-zinc-300"/>
   {toolbarButton('Lista com marcadores','insertUnorderedList','• Lista')}
   {toolbarButton('Lista numerada','insertOrderedList','1. Lista')}
   {toolbarButton('Desfazer','undo','↶')}
   {toolbarButton('Refazer','redo','↷')}
  </div>
  <div ref={editorRef} role="textbox" aria-label="Texto completo do termo" aria-multiline="true"
    contentEditable={!disabled} suppressContentEditableWarning
    onInput={emit} onKeyUp={rememberSelection} onMouseUp={rememberSelection}
    onSelect={rememberSelection} onBlur={rememberSelection} onPaste={paste}
    onDrop={e=>e.preventDefault()}
    data-placeholder="Insira o termo revisado pela instituição."
    className="min-h-64 max-h-[32rem] overflow-y-auto px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-400
      [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6
      [&_p]:my-2 [&_div]:my-1 empty:before:content-[attr(data-placeholder)] empty:before:text-zinc-400"/>
  <p className="border-t bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
   Selecione o trecho e use os botões para formatar. O aluno verá o texto como foi preparado.
  </p>
 </div>;
}
