import React, { useState, useMemo } from "react";
import { useAppStore, Student, Prospect } from "../store";
import { Ban, Search, UserCheck, Edit2, FileText, X, Printer, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

type ClientType = "all" | "student" | "prospect";

interface CombinedClient {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  instrument: string;
  type: "student" | "prospect";
  ineligibility_reason: string;
  original: Student | Prospect;
}

export const NotEligible: React.FC = () => {
  const { state, updateStudent, updateProspect } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<ClientType>("all");
  
  // Modal state for editing justification
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<CombinedClient | null>(null);
  const [editReason, setEditReason] = useState("");

  // Combine ineligible students and prospects
  const combinedIneligibleClients = useMemo(() => {
    const ineligibleStudents: CombinedClient[] = state.students
      .filter((s) => s.not_eligible)
      .map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        cpf: s.cpf,
        instrument: s.instrument,
        type: "student",
        ineligibility_reason: s.ineligibility_reason || "Sem justificativa preenchida",
        original: s,
      }));

    const ineligibleProspects: CombinedClient[] = state.prospects
      .filter((p) => p.not_eligible)
      .map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        cpf: p.cpf,
        instrument: p.instrument,
        type: "prospect",
        ineligibility_reason: p.ineligibility_reason || "Sem justificativa preenchida",
        original: p,
      }));

    return [...ineligibleStudents, ...ineligibleProspects];
  }, [state.students, state.prospects]);

  // Filter combined list
  const filteredClients = useMemo(() => {
    return combinedIneligibleClients.filter((client) => {
      const matchesSearch =
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.instrument.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (client.cpf && client.cpf.includes(searchTerm));

      const matchesType =
        typeFilter === "all" || client.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [combinedIneligibleClients, searchTerm, typeFilter]);

  // Handle re-enabling eligibility
  const handleMakeEligible = async (client: CombinedClient) => {
    const confirmMsg = `Deseja reativar a elegibilidade de ${
      client.type === "student" ? "aluno" : "interessado"
    } "${client.name}"?`;

    if (window.confirm(confirmMsg)) {
      if (client.type === "student") {
        await updateStudent(client.id, { not_eligible: false, ineligibility_reason: "" });
      } else {
        await updateProspect(client.id, { not_eligible: false, ineligibility_reason: "" });
      }
    }
  };

  // Open modal to edit justification
  const handleOpenEditModal = (client: CombinedClient) => {
    setSelectedClient(client);
    setEditReason(client.ineligibility_reason);
    setIsEditModalOpen(true);
  };

  // Submit edited justification
  const handleSaveJustification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !editReason.trim()) return;

    if (selectedClient.type === "student") {
      await updateStudent(selectedClient.id, { ineligibility_reason: editReason });
    } else {
      await updateProspect(selectedClient.id, { ineligibility_reason: editReason });
    }

    setIsEditModalOpen(false);
    setSelectedClient(null);
    setEditReason("");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:p-0">
      {/* Header and top stats */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 flex items-center">
            <Ban className="w-6 h-6 mr-2.5 text-rose-600" />
            Clientes Não Elegíveis
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Lista consolidada de alunos e pré-cadastros com restrições e justificativas.
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm flex items-center"
        >
          <Printer className="w-4 h-4 mr-1.5" />
          Imprimir Relatório
        </button>
      </div>

      {/* Summary card print header */}
      <div className="hidden print:block mb-8 border-b border-zinc-300 pb-4">
        <h1 className="text-3xl font-bold text-zinc-900">Relatório de Clientes Não Elegíveis</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Gerado em {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR")}
        </p>
        <div className="mt-4 flex gap-6 text-sm text-zinc-700">
          <div><strong>Total Não Elegíveis:</strong> {combinedIneligibleClients.length}</div>
          <div><strong>Alunos:</strong> {combinedIneligibleClients.filter(c => c.type === "student").length}</div>
          <div><strong>Pré-cadastros:</strong> {combinedIneligibleClients.filter(c => c.type === "prospect").length}</div>
        </div>
      </div>

      {/* Quick stats widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 flex items-center shadow-sm">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mr-4">
            <Ban className="w-6 h-6" />
          </div>
          <div>
            <span className="text-sm text-zinc-500 font-medium">Total de Restrições</span>
            <p className="text-2xl font-bold text-zinc-900 mt-0.5">{combinedIneligibleClients.length}</p>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-5 flex items-center shadow-sm">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mr-4">
            <span className="text-sm font-bold">AL</span>
          </div>
          <div>
            <span className="text-sm text-zinc-500 font-medium">Alunos Matriculados</span>
            <p className="text-2xl font-bold text-zinc-900 mt-0.5">
              {combinedIneligibleClients.filter((c) => c.type === "student").length}
            </p>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-5 flex items-center shadow-sm">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mr-4">
            <span className="text-sm font-bold">PR</span>
          </div>
          <div>
            <span className="text-sm text-zinc-500 font-medium">Interessados (Pré-cadastros)</span>
            <p className="text-2xl font-bold text-zinc-900 mt-0.5">
              {combinedIneligibleClients.filter((c) => c.type === "prospect").length}
            </p>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 shadow-sm print:hidden">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Pesquisar por nome, instrumento, email ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
          />
        </div>
        
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ClientType)}
              className="appearance-none bg-white border border-zinc-200 rounded-xl pl-4 pr-10 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-medium text-zinc-700"
            >
              <option value="all">Todos os tipos</option>
              <option value="student">Apenas Alunos</option>
              <option value="prospect">Apenas Pré-cadastros</option>
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Consolidate Report Table */}
      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-zinc-200 text-left">
            <thead className="bg-zinc-50 font-semibold text-zinc-600 text-xs uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-6 py-3.5">Cliente</th>
                <th scope="col" className="px-6 py-3.5">Tipo</th>
                <th scope="col" className="px-6 py-3.5">Instrumento</th>
                <th scope="col" className="px-6 py-3.5">Justificativa de Restrição</th>
                <th scope="col" className="px-6 py-3.5 text-right print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200 text-sm">
              {filteredClients.length > 0 ? (
                filteredClients.map((client) => (
                  <tr key={`${client.type}-${client.id}`} className="hover:bg-zinc-50/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-zinc-900">{client.name}</div>
                      <div className="text-xs text-zinc-500 space-y-0.5 mt-0.5">
                        {client.email && <div>{client.email}</div>}
                        {client.phone && <div>{client.phone}</div>}
                        {client.cpf && <div>CPF: {client.cpf}</div>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {client.type === "student" ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 border border-indigo-100 text-indigo-700">
                          Aluno Matriculado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 border border-amber-100 text-amber-700">
                          Pré-cadastro
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-zinc-600">
                      {client.instrument}
                    </td>
                    <td className="px-6 py-4 max-w-sm">
                      <div className="text-rose-700 font-medium whitespace-pre-wrap leading-relaxed">
                        {client.ineligibility_reason}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right print:hidden">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleOpenEditModal(client)}
                          className="p-1.5 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-100 rounded-lg transition-colors"
                          title="Editar Justificativa"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMakeEligible(client)}
                          className="p-1.5 text-rose-500 hover:text-emerald-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Reativar Elegibilidade"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 mb-3 text-zinc-400">
                      <Ban className="w-6 h-6" />
                    </div>
                    <h4 className="font-semibold text-zinc-900 mb-0.5">Nenhum cliente não elegível</h4>
                    <p className="text-xs text-zinc-400">
                      Não há registros que correspondam aos filtros definidos.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Justification Modal */}
      <AnimatePresence>
        {isEditModalOpen && selectedClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => {
                setIsEditModalOpen(false);
                setSelectedClient(null);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10 flex flex-col bg-white"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-white">
                <h3 className="text-lg font-semibold text-zinc-900 flex items-center">
                  <Edit2 className="w-5 h-5 mr-2 text-indigo-600" />
                  Editar Justificativa
                </h3>
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedClient(null);
                  }}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveJustification} className="p-6 space-y-4 bg-white">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                    Cliente
                  </label>
                  <div className="font-medium text-zinc-800">{selectedClient.name}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {selectedClient.type === "student" ? "Aluno Matriculado" : "Pré-cadastro"}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-sm font-medium text-zinc-700">
                    Justificativa <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Escreva a nova justificativa de não elegibilidade..."
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm bg-white"
                  />
                </div>

                <div className="pt-2 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setSelectedClient(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Salvar Alterações
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
