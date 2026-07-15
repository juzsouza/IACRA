import React, { useState } from "react";
import { Plus, Search, Edit2, Trash2, X, FileCheck, CheckCircle2, AlertCircle, MessageSquare, Clock, Phone, Send, Ban } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppStore, Prospect } from "../store";

const formatCPF = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const truncated = digits.slice(0, 11);
  if (truncated.length <= 3) return truncated;
  if (truncated.length <= 6) return `${truncated.slice(0, 3)}.${truncated.slice(3)}`;
  if (truncated.length <= 9) return `${truncated.slice(0, 3)}.${truncated.slice(3, 6)}.${truncated.slice(6)}`;
  return `${truncated.slice(0, 3)}.${truncated.slice(3, 6)}.${truncated.slice(6, 9)}-${truncated.slice(9)}`;
};

export const Prospects: React.FC = () => {
  const { state, addProspect, updateProspect, deleteProspect, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterApproved, setFilterApproved] = useState<"all" | "pending" | "approved">("all");
  const [filterTerm, setFilterTerm] = useState<"all" | "signed" | "unsigned">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);

  // Message Tracking States
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [activeProspect, setActiveProspect] = useState<Prospect | null>(null);
  const [newMessageNote, setNewMessageNote] = useState("");
  const [newMessageStatus, setNewMessageStatus] = useState<"contato_iniciado" | "aguardando_retorno" | "nao_deu_retorno" | "">("");

  // States for prospect ineligibility justification modal
  const [isJustificationModalOpen, setIsJustificationModalOpen] = useState(false);
  const [justificationProspect, setJustificationProspect] = useState<Prospect | null>(null);
  const [justificationText, setJustificationText] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    instrument: "",
    term_signed: false,
    approved: false,
    notes: "",
    lead_status: "" as "contato_iniciado" | "aguardando_retorno" | "nao_deu_retorno" | "",
    not_eligible: false,
    ineligibility_reason: "",
  });

  const filteredProspects = state.prospects.filter((p) => {
    const matchesSearch =
      (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.instrument || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.cpf && p.cpf.replace(/\D/g, "").includes(searchTerm.replace(/\D/g, "")));

    const matchesApproved =
      filterApproved === "all" ||
      (filterApproved === "approved" && p.approved) ||
      (filterApproved === "pending" && !p.approved);

    const matchesTerm =
      filterTerm === "all" ||
      (filterTerm === "signed" && p.term_signed) ||
      (filterTerm === "unsigned" && !p.term_signed);

    return matchesSearch && matchesApproved && matchesTerm;
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!formData.name.trim() || !formData.instrument.trim()) {
      alert("Por favor, preencha o nome e o instrumento.");
      return;
    }

    const cleanCpf = formData.cpf.replace(/\D/g, "");
    if (cleanCpf) {
      const duplicate = state.prospects.find(p => 
        p.id !== editingProspect?.id && 
        (p.cpf || "").replace(/\D/g, "") === cleanCpf
      );
      if (duplicate) {
        setErrorMsg(`Este CPF já possui cadastro de interessado (Pré-cadastro: "${duplicate.name}").`);
        return;
      }
    }

    if (formData.not_eligible && !formData.ineligibility_reason.trim()) {
      setErrorMsg("Por favor, preencha a justificativa para marcar o pré-cadastro como não elegível.");
      return;
    }

    if (editingProspect) {
      await updateProspect(editingProspect.id, formData);
    } else {
      await addProspect(formData);
    }
    setIsModalOpen(false);
  };

  const openModal = (prospect?: Prospect) => {
    setErrorMsg(null);
    if (prospect) {
      setEditingProspect(prospect);
      setFormData({
        name: prospect.name || "",
        email: prospect.email || "",
        phone: prospect.phone || "",
        cpf: prospect.cpf || "",
        instrument: prospect.instrument || "",
        term_signed: prospect.term_signed || false,
        approved: prospect.approved || false,
        notes: prospect.notes || "",
        lead_status: prospect.lead_status || "",
        not_eligible: prospect.not_eligible || false,
        ineligibility_reason: prospect.ineligibility_reason || "",
      });
    } else {
      setEditingProspect(null);
      setFormData({
        name: "",
        email: "",
        phone: "",
        cpf: "",
        instrument: "",
        term_signed: false,
        approved: false,
        notes: "",
        lead_status: "",
        not_eligible: false,
        ineligibility_reason: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleQuickApprove = async (prospect: Prospect) => {
    const isNowApproved = !prospect.approved;
    await updateProspect(prospect.id, { approved: isNowApproved });
  };

  const handleQuickTermSigned = async (prospect: Prospect) => {
    const isNowSigned = !prospect.term_signed;
    await updateProspect(prospect.id, { term_signed: isNowSigned });
  };

  const handleAddMessageLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProspect || !newMessageNote.trim()) return;

    const currentHistory = activeProspect.message_history || [];
    const newEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      note: newMessageNote,
      status: newMessageStatus || activeProspect.lead_status || "contato_iniciado",
    };

    const updatedHistory = [...currentHistory, newEntry];
    const updatedStatus = newMessageStatus || activeProspect.lead_status || "contato_iniciado";

    await updateProspect(activeProspect.id, {
      message_history: updatedHistory,
      lead_status: updatedStatus as any,
    });

    // Keep state sync in the active prospect modal
    setActiveProspect({
      ...activeProspect,
      message_history: updatedHistory,
      lead_status: updatedStatus as any,
    });

    setNewMessageNote("");
    setNewMessageStatus("");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Pré-cadastro de Prospectos
          </h1>
          <p className="text-zinc-500 text-sm">
            Gerencie os interessados que se tornarão alunos após aprovações e termo assinado.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition-colors shadow-sm shadow-indigo-100"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Pré-cadastro
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por nome, instrumento, email ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-colors"
          />
        </div>
        {currentUserProfile?.role === "super_admin" && (
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium text-zinc-500">Aprovação:</span>
              <select
                value={filterApproved}
                onChange={(e: any) => setFilterApproved(e.target.value)}
                className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 font-medium outline-none text-zinc-700"
              >
                <option value="all">Todos</option>
                <option value="pending">Pendentes</option>
                <option value="approved">Aprovados</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium text-zinc-500">Termo:</span>
              <select
                value={filterTerm}
                onChange={(e: any) => setFilterTerm(e.target.value)}
                className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 font-medium outline-none text-zinc-700"
              >
                <option value="all">Todos</option>
                <option value="signed">Assinado</option>
                <option value="unsigned">Não assinado</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Prospects Table */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-zinc-50 border-b border-zinc-100 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                <th className="px-6 py-4">Nome / Contato</th>
                <th className="px-6 py-4">Instrumento</th>
                <th className="px-6 py-4">Acompanhamento</th>
                {currentUserProfile?.role === "super_admin" && (
                  <>
                    <th className="px-6 py-4 text-center">Termo Assinado?</th>
                    <th className="px-6 py-4 text-center">Aprovado?</th>
                  </>
                )}
                <th className="px-6 py-4">Observações</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-sm">
              {filteredProspects.length === 0 ? (
                <tr>
                  <td colSpan={currentUserProfile?.role === "super_admin" ? 7 : 5} className="px-6 py-12 text-center text-zinc-500">
                    Nenhum pré-cadastro encontrado.
                  </td>
                </tr>
              ) : (
                filteredProspects.map((prospect) => (
                  <tr key={prospect.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <div className="font-semibold text-zinc-900">{prospect.name}</div>
                        {prospect.not_eligible && (
                          <span
                            className="px-2 py-0.5 text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-700 rounded-full shrink-0 cursor-help"
                            title={`Justificativa: ${prospect.ineligibility_reason || 'Sem justificativa preenchida'}`}
                          >
                            Não Elegível
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 space-y-0.5 mt-0.5">
                        <div>{prospect.email}</div>
                        <div>{prospect.phone}</div>
                        {prospect.cpf && <div>CPF: {prospect.cpf}</div>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 inline-flex text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700">
                        {prospect.instrument}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <select
                          value={prospect.lead_status || ""}
                          onChange={async (e) => {
                            await updateProspect(prospect.id, { lead_status: e.target.value as any });
                          }}
                          className={`text-xs font-semibold rounded-xl border border-zinc-200/85 px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white ${
                            prospect.lead_status === "contato_iniciado"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : prospect.lead_status === "aguardando_retorno"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : prospect.lead_status === "nao_deu_retorno"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-zinc-50 text-zinc-600 border-zinc-200"
                          }`}
                        >
                          <option value="">Sem status</option>
                          <option value="contato_iniciado">Contato Iniciado</option>
                          <option value="aguardando_retorno">Aguardando Retorno</option>
                          <option value="nao_deu_retorno">Não deu retorno</option>
                        </select>
                        
                        <button
                          onClick={() => {
                            setActiveProspect(prospect);
                            setIsMessageModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-indigo-600 rounded-lg transition-colors relative flex items-center justify-center"
                          title="Acompanhamento de Mensagens"
                        >
                          <MessageSquare className="w-4 h-4" />
                          {prospect.message_history && prospect.message_history.length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-indigo-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                              {prospect.message_history.length}
                            </span>
                          )}
                        </button>
                      </div>
                    </td>
                    {currentUserProfile?.role === "super_admin" && (
                      <>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleQuickTermSigned(prospect)}
                            className={`inline-flex items-center justify-center p-1.5 rounded-lg transition-colors ${
                              prospect.term_signed
                                ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                            }`}
                            title={prospect.term_signed ? "Marcar como Não Assinado" : "Marcar como Assinado"}
                          >
                            <FileCheck className="w-5 h-5 mr-1" />
                            <span className="text-xs font-semibold mr-1">
                              {prospect.term_signed ? "Sim" : "Não"}
                            </span>
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleQuickApprove(prospect)}
                            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-xl transition-colors ${
                              prospect.approved
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                            }`}
                            title={prospect.approved ? "Desfazer aprovação" : "Aprovar (Envia para alunos)"}
                          >
                            {prospect.approved ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
                                <span className="text-xs font-semibold">Aprovado</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-4 h-4 mr-1 text-zinc-400" />
                                <span className="text-xs font-semibold">Pendente</span>
                              </>
                            )}
                          </button>
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 text-zinc-600 max-w-xs truncate" title={prospect.notes}>
                      {prospect.notes || "-"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={async () => {
                            if (prospect.not_eligible) {
                              if (confirm(`Deseja tornar o interessado "${prospect.name}" elegível novamente?`)) {
                                await updateProspect(prospect.id, { not_eligible: false, ineligibility_reason: "" });
                              }
                            } else {
                              setJustificationProspect(prospect);
                              setJustificationText("");
                              setIsJustificationModalOpen(true);
                            }
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            prospect.not_eligible
                              ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                              : "hover:bg-zinc-100 text-zinc-400 hover:text-rose-600"
                          }`}
                          title={prospect.not_eligible ? `Não Elegível: ${prospect.ineligibility_reason || 'Tornar Elegível'}` : "Definir como Não Elegível"}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openModal(prospect)}
                          className="p-1.5 hover:bg-zinc-100 text-zinc-600 hover:text-indigo-600 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Tem certeza de que deseja excluir este pré-cadastro?")) {
                              deleteProspect(prospect.id);
                            }
                          }}
                          className="p-1.5 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-zinc-100 shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-zinc-900">
                  {editingProspect ? "Editar Pré-cadastro" : "Novo Pré-cadastro"}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Nome Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Ex: João da Silva"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="joao@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Telefone
                    </label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      CPF
                    </label>
                    <input
                      type="text"
                      value={formData.cpf}
                      onChange={(e) => setFormData({ ...formData, cpf: formatCPF(e.target.value) })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono"
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Instrumento <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.instrument}
                      onChange={(e) => setFormData({ ...formData, instrument: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="Ex: Piano, Violão"
                    />
                  </div>
                </div>

                {/* Markings Checkboxes */}
                {currentUserProfile?.role === "super_admin" && (
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-150 space-y-3">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.term_signed}
                        onChange={(e) => setFormData({ ...formData, term_signed: e.target.checked })}
                        className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-sm font-semibold text-zinc-800">Termo Assinado?</span>
                        <p className="text-xs text-zinc-500">O interessado assinou o contrato/termo de matrícula?</p>
                      </div>
                    </label>

                    <label className="flex items-center space-x-3 cursor-pointer border-t border-zinc-200/60 pt-3">
                      <input
                        type="checkbox"
                        checked={formData.approved}
                        onChange={(e) => setFormData({ ...formData, approved: e.target.checked })}
                        className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-sm font-semibold text-zinc-800">Aprovado?</span>
                        <p className="text-xs text-zinc-500">Aprovado para virar aluno automaticamente?</p>
                      </div>
                    </label>

                    <label className="flex items-center space-x-3 cursor-pointer border-t border-zinc-200/60 pt-3">
                      <input
                        type="checkbox"
                        checked={formData.not_eligible}
                        onChange={(e) => setFormData({ ...formData, not_eligible: e.target.checked, ineligibility_reason: e.target.checked ? formData.ineligibility_reason : "" })}
                        className="w-4 h-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
                      />
                      <div>
                        <span className="text-sm font-semibold text-rose-700">Cliente não elegível</span>
                        <p className="text-xs text-zinc-500">Marcar este pré-cadastro como não elegível</p>
                      </div>
                    </label>

                    {formData.not_eligible && (
                      <div className="space-y-1 pt-2 border-t border-zinc-150">
                        <label className="block text-sm font-medium text-zinc-700">
                          Justificativa de Não Elegibilidade <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          required={formData.not_eligible}
                          rows={3}
                          placeholder="Insira o motivo / justificativa..."
                          value={formData.ineligibility_reason}
                          onChange={(e) => setFormData({ ...formData, ineligibility_reason: e.target.value })}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm bg-white"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Status de Acompanhamento
                  </label>
                  <select
                    value={formData.lead_status}
                    onChange={(e) => setFormData({ ...formData, lead_status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-sm font-medium"
                  >
                    <option value="">Sem status (Novo)</option>
                    <option value="contato_iniciado">Contato Iniciado</option>
                    <option value="aguardando_retorno">Aguardando Retorno</option>
                    <option value="nao_deu_retorno">Não deu retorno</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Observações / Notas
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm h-20 resize-none"
                    placeholder="Documentos pendentes, histórico musical, etc."
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-indigo-100"
                  >
                    Salvar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Message Tracking / Follow-up History Modal */}
      <AnimatePresence>
        {isMessageModalOpen && activeProspect && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMessageModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-zinc-100 shadow-2xl w-full max-w-lg overflow-hidden relative z-10 flex flex-col max-h-[85vh]"
            >
              <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="font-bold text-lg text-zinc-900">
                    Acompanhamento de Mensagens
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    {activeProspect.name} • {activeProspect.instrument}
                  </p>
                </div>
                <button
                  onClick={() => setIsMessageModalOpen(false)}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* WhatsApp Quick Action */}
              <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100/60 flex items-center justify-between flex-shrink-0">
                <span className="text-xs font-semibold text-indigo-700 flex items-center">
                  <Phone className="w-3.5 h-3.5 mr-1.5" />
                  Telefone: {activeProspect.phone || "Não cadastrado"}
                </span>
                {activeProspect.phone && (
                  <a
                    href={`https://api.whatsapp.com/send?phone=${activeProspect.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-xl transition-colors shadow-sm shadow-emerald-100"
                  >
                    Abrir no WhatsApp
                  </a>
                )}
              </div>

              {/* History List */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-zinc-50/50">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Histórico de Interações
                  </h4>
                  {(!activeProspect.message_history || activeProspect.message_history.length === 0) ? (
                    <div className="bg-white rounded-2xl border border-zinc-100 p-6 text-center text-zinc-500 text-sm">
                      Nenhuma mensagem ou contato registrado ainda.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeProspect.message_history.slice().reverse().map((log) => (
                        <div key={log.id} className="bg-white rounded-2xl border border-zinc-150 p-4 shadow-sm flex flex-col space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              log.status === "contato_iniciado"
                                ? "bg-blue-50 text-blue-700"
                                : log.status === "aguardando_retorno"
                                ? "bg-amber-50 text-amber-700"
                                : log.status === "nao_deu_retorno"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-zinc-100 text-zinc-600"
                            }`}>
                              {log.status === "contato_iniciado"
                                ? "Contato Iniciado"
                                : log.status === "aguardando_retorno"
                                ? "Aguardando Retorno"
                                : log.status === "nao_deu_retorno"
                                ? "Não deu retorno"
                                : "Sem status"}
                            </span>
                            <span className="text-xs text-zinc-400 font-mono flex items-center">
                              <Clock className="w-3.5 h-3.5 mr-1" />
                              {new Date(log.date).toLocaleDateString("pt-BR")} às {new Date(log.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-700 font-medium leading-relaxed">
                            {log.note}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Add interaction form */}
              <div className="p-6 border-t border-zinc-100 bg-white flex-shrink-0">
                <form onSubmit={handleAddMessageLog} className="space-y-4">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    Registrar Novo Contato / Mensagem
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">
                        Atualizar Status para
                      </label>
                      <select
                        value={newMessageStatus}
                        onChange={(e) => setNewMessageStatus(e.target.value as any)}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-sm font-medium"
                      >
                        <option value="">Manter atual ({
                          activeProspect.lead_status === "contato_iniciado"
                            ? "Contato Iniciado"
                            : activeProspect.lead_status === "aguardando_retorno"
                            ? "Aguardando Retorno"
                            : activeProspect.lead_status === "nao_deu_retorno"
                            ? "Não deu retorno"
                            : "Nenhum"
                        })</option>
                        <option value="contato_iniciado">Contato Iniciado</option>
                        <option value="aguardando_retorno">Aguardando Retorno</option>
                        <option value="nao_deu_retorno">Não deu retorno</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">
                        Anotações do Contato
                      </label>
                      <textarea
                        required
                        value={newMessageNote}
                        onChange={(e) => setNewMessageNote(e.target.value)}
                        placeholder="Ex: Enviei o contrato via WhatsApp e estou aguardando ele assinar até amanhã..."
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm h-20 resize-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm shadow-indigo-100 flex items-center"
                    >
                      <Send className="w-4 h-4 mr-1.5" />
                      Registrar Mensagem
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Prospects Ineligibility Justification Modal */}
      <AnimatePresence>
        {isJustificationModalOpen && justificationProspect && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsJustificationModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10 flex flex-col bg-white"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-white">
                <h3 className="text-lg font-semibold text-zinc-900 flex items-center">
                  <Ban className="w-5 h-5 mr-2 text-rose-600" />
                  Justificativa de Não Elegibilidade
                </h3>
                <button
                  onClick={() => setIsJustificationModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!justificationText.trim()) return;
                  await updateProspect(justificationProspect.id, {
                    not_eligible: true,
                    ineligibility_reason: justificationText,
                  });
                  setIsJustificationModalOpen(false);
                  setJustificationProspect(null);
                  setJustificationText("");
                }}
                className="p-6 space-y-4 bg-white"
              >
                <p className="text-sm text-zinc-600">
                  Por favor, insira a justificativa para marcar o interessado <span className="font-semibold text-zinc-900">"{justificationProspect.name}"</span> como não elegível.
                </p>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-zinc-700">
                    Justificativa <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Ex: Não responde contatos / Solicitou não ser importunado..."
                    value={justificationText}
                    onChange={(e) => setJustificationText(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none text-sm bg-white"
                  />
                </div>
                <div className="pt-2 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsJustificationModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-sm"
                  >
                    Confirmar Não Elegível
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
