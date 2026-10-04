import React from 'react';
import { Shield, ArrowLeft, Calendar, Mail, Lock, CheckCircle, ExternalLink, FileText, Phone } from 'lucide-react';

export const PrivacyPolicy: React.FC = () => {
  const lastUpdated = "22 de setembro de 2026";

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header público */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm shadow-indigo-200">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-zinc-900 tracking-tight text-base sm:text-lg">EAVRA</span>
              <span className="text-xs text-zinc-500 block leading-none">INSTITUTO DE ARTE E VOCAL RAPHAEL AUGUSTO</span>
            </div>
          </div>

          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao sistema</span>
          </button>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Banner do Título */}
        <div className="mb-10 pb-8 border-b border-zinc-200">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold mb-4">
            <FileText className="w-3.5 h-3.5" />
            Documento Público Oficial
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-zinc-900 tracking-tight">
            Política de Privacidade
          </h1>
          <p className="text-sm text-zinc-500 mt-2">
            Última atualização: <span className="font-medium text-zinc-700">{lastUpdated}</span>
          </p>
          <p className="text-base text-zinc-600 mt-4 leading-relaxed">
            Esta Política de Privacidade descreve de forma transparente como a plataforma <strong>EAVRA</strong>,
            vinculada ao domínio <strong>institutoiacra.com.br</strong>, coleta, utiliza, armazena, protege e descarta
            os dados pessoais de seus usuários, professores e alunos, em total conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018)</strong> e com a <strong>Google API Services User Data Policy</strong> (Política de Dados de Usuários dos Serviços de API do Google).
          </p>
        </div>

        <div className="space-y-10 text-sm sm:text-base leading-relaxed text-zinc-700">
          {/* Seção 1 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold">1</span>
              Identificação do Aplicativo
            </h2>
            <p>
              O <strong>EAVRA</strong> é um sistema especializado para gestão acadêmica, pedagógica e administrativa de escolas de música. Entre suas funcionalidades estão o controle de horários de aulas individuais e em grupo, acompanhamento de presenças, relatórios didáticos, organização financeira interna de turmas e integração com calendários eletrônicos.
            </p>
            <p>
              O domínio oficial do aplicativo é <strong>institutoiacra.com.br</strong>.
            </p>
          </section>

          {/* Seção 2 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold">2</span>
              Responsável pelo Tratamento dos Dados
            </h2>
            <p>
              O tratamento dos dados pessoais no âmbito da plataforma é realizado sob a responsabilidade do:
            </p>
            <div className="bg-zinc-100/80 border border-zinc-200 rounded-xl p-4 space-y-1 font-mono text-xs sm:text-sm">
              <p><strong>Controlador:</strong> RAPHAEL AUGUSTO PINTO (INSTITUTO DE ARTE E VOCAL RAPHAEL AUGUSTO)</p>
              <p><strong>CNPJ:</strong> 18.476.370/0001-65</p>
              <p><strong>Endereço:</strong> Joaquim Nabuco, 1040 - Presidente Prudente</p>
              <p><strong>Canal de Privacidade e DPO/Encarregado:</strong> institutodeartera@gmail.com</p>
              <p><strong>Nome do Responsável/Encarregado:</strong> Raphael Augusto</p>
            </div>
          </section>

          {/* Seção 3, 4, 5, 6 */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold">3</span>
              Quais Dados Pessoais São Tratados
            </h2>
            <p>
              A plataforma trata estritamente as categorias de dados necessárias para a prestação dos serviços educacionais e de gestão escolar:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Card Usuários e Professores */}
              <div className="bg-white p-5 rounded-xl border border-zinc-200 space-y-2">
                <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  Dados de Usuários e Professores
                </h3>
                <ul className="list-disc list-inside text-xs sm:text-sm space-y-1 text-zinc-600">
                  <li>Nome completo e identificador interno único (ID);</li>
                  <li>E-mail institucional/pessoal para login e autenticação;</li>
                  <li>Número de telefone para contato profissional;</li>
                  <li>CPF (quando cadastrado para controle administrativo);</li>
                  <li>Especialidades musicais e horários de trabalho pedagógico;</li>
                  <li>Nível de permissão (super_admin, admin, teacher) e status de acesso.</li>
                </ul>
              </div>

              {/* Card Alunos */}
              <div className="bg-white p-5 rounded-xl border border-zinc-200 space-y-2">
                <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Dados de Alunos e Interessados
                </h3>
                <ul className="list-disc list-inside text-xs sm:text-sm space-y-1 text-zinc-600">
                  <li>Nome completo e identificador do aluno;</li>
                  <li>E-mail e número de telefone (WhatsApp);</li>
                  <li>CPF e data de nascimento (quando fornecidos);</li>
                  <li>Instrumento musical e turma/grupo de matrícula;</li>
                  <li>Status de matrícula (ativo/inativo) e histórico de planos contratados.</li>
                </ul>
              </div>

              {/* Card Aulas e Registros Didáticos */}
              <div className="bg-white p-5 rounded-xl border border-zinc-200 space-y-2">
                <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  Dados Relacionados às Aulas
                </h3>
                <ul className="list-disc list-inside text-xs sm:text-sm space-y-1 text-zinc-600">
                  <li>Data, horário de início e fim da sessão;</li>
                  <li>Vínculo entre o professor ministrante e o(s) aluno(s);</li>
                  <li>Status da aula (agendada, concluída, cancelada);</li>
                  <li>Registro de presença (presente/ausente/falta justificada);</li>
                  <li>Relatório didático-pedagógico e orientações de rotina vocal/instrumental.</li>
                </ul>
              </div>

              {/* Card WhatsApp */}
              <div className="bg-white p-5 rounded-xl border border-zinc-200 space-y-2">
                <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                  <Phone className="w-4 h-4 text-indigo-600" />
                  Comunicações via WhatsApp
                </h3>
                <ul className="list-disc list-inside text-xs sm:text-sm space-y-1 text-zinc-600">
                  <li>Número de telefone para disparo de lembretes e confirmações;</li>
                  <li>O envio ocorre por ação do usuário ao abrir o aplicativo oficial WhatsApp;</li>
                  <li>A plataforma não monitora nem acessa conversas privadas do WhatsApp.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Seção 7, 8, 9 - DESTAQUE GOOGLE CALENDAR */}
          <section className="space-y-4 pt-2">
            <div className="bg-indigo-50/70 border-2 border-indigo-200 rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-semibold">
                <Calendar className="w-3.5 h-3.5" />
                Seção Específica: Uso dos Dados do Google
              </div>

              <h2 className="text-2xl font-extrabold text-zinc-900 tracking-tight">
                Integração com Google Calendar e Escopos Utilizados
              </h2>

              <p className="text-zinc-700">
                A plataforma EAVRA oferece aos professores a funcionalidade <strong>estritamente opcional</strong> de conectar sua conta do Google Agenda para organizar seus compromissos de aula.
              </p>

              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-zinc-900 text-base">
                  1. Sentido Unidirecional da Integração (Plataforma → Google Agenda)
                </h3>
                <p className="text-zinc-700">
                  O fluxo de sincronização opera <strong>exclusivamente no sentido Plataforma → Google Agenda</strong>. A plataforma envia para a agenda do professor apenas os eventos correspondentes às suas aulas agendadas no EAVRA. <strong>O sistema NÃO lê, NÃO importa, NÃO armazena e NÃO monitora nenhum evento pessoal, agenda de terceiros ou compromissos pré-existentes do professor na sua conta Google.</strong>
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-zinc-900 text-base">
                  2. Escopos de Acesso Solicitados e Justificativa
                </h3>
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="p-3 bg-white rounded-xl border border-indigo-100">
                    <p className="font-mono text-indigo-700 font-semibold break-all">
                      https://www.googleapis.com/auth/calendar.events.owned
                    </p>
                    <p className="text-zinc-600 mt-1">
                      <strong>Finalidade:</strong> Permite à plataforma criar, atualizar o horário ou remover da agenda do professor os eventos de aulas gerenciadas pelo sistema EAVRA.
                    </p>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-indigo-100">
                    <p className="font-mono text-indigo-700 font-semibold break-all">
                      https://www.googleapis.com/auth/userinfo.email
                    </p>
                    <p className="text-zinc-600 mt-1">
                      <strong>Finalidade:</strong> Permite identificar qual endereço de e-mail Google foi vinculado pelo professor para exibir o status de conexão no painel do professor (ex: "Conectado como professor@gmail.com").
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-zinc-900 text-base">
                  3. Quais Dados do Google São Armazenados
                </h3>
                <ul className="list-disc list-inside space-y-1 text-zinc-700 text-xs sm:text-sm">
                  <li><strong>E-mail da conta Google conectada:</strong> armazenado no registro do professor para confirmação visual de conexão;</li>
                  <li><strong>Tokens OAuth 2.0 (refresh_token e access_token temporário):</strong> armazenados exclusivamente no servidor seguro (tabela <code>teacher_google_accounts</code> e armazenamento protegido de fallback do servidor), utilizados unicamente para assinar as requisições de criação de eventos de aulas;</li>
                  <li><strong>Identificadores de eventos (google_event_id):</strong> armazenados para permitir que a plataforma atualize ou cancele o evento correspondente quando a aula for remarcada ou cancelada na escola.</li>
                </ul>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-zinc-900 text-base">
                  4. Conformidade com a Google API Services User Data Policy (Uso Limitado)
                </h3>
                <p className="text-zinc-700">
                  O uso e a transferência de informações recebidas de APIs do Google pelo aplicativo EAVRA para qualquer outro aplicativo seguirão estritamente a <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline font-medium inline-flex items-center gap-1">Google API Services User Data Policy <ExternalLink className="w-3 h-3" /></a>, incluindo os requisitos de <strong>Uso Limitado (Limited Use Requirements)</strong>:
                </p>
                <div className="bg-white p-4 rounded-xl border border-indigo-200 text-xs sm:text-sm space-y-2 text-zinc-800">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Sem Publicidade:</strong> O EAVRA <strong>não utiliza</strong> dados do Google para veiculação de anúncios de qualquer natureza.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Sem Venda de Dados:</strong> O EAVRA <strong>não vende, não transfere e não licencia</strong> dados de usuários do Google para terceiros, corretores de dados ou plataformas de marketing.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Sem Uso de IA não Consentido:</strong> O EAVRA <strong>não utiliza</strong> os dados obtidos da Google Calendar API para treinar modelos de inteligência artificial de uso geral ou modelos de linguagem.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Sem Acesso Humano:</strong> Nenhum funcionário ou colaborador da escola visualiza os dados ou tokens da API do Google, exceto em caso de suporte técnico expressamente solicitado pelo professor ou quando exigido por lei.</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-zinc-900 text-base">
                  5. Desconexão da Conta Google e Exclusão Imediata de Tokens
                </h3>
                <p className="text-zinc-700">
                  O professor pode desconectar sua conta Google a qualquer momento diretamente no card da tela de Aulas, clicando no botão <strong>"Desconectar"</strong>. Ao desconectar:
                </p>
                <ul className="list-disc list-inside space-y-1 text-zinc-700 text-xs sm:text-sm">
                  <li>O <code>refresh_token</code> e o <code>access_token</code> são <strong>imediatamente apagados</strong> do banco de dados e de qualquer armazenamento do servidor;</li>
                  <li>O status de conexão é revertido para desconectado;</li>
                  <li>Nenhuma sincronização futura será efetuada até que uma nova autorização voluntária seja concedida pelo professor.</li>
                </ul>
                <p className="text-xs text-zinc-500 mt-2">
                  Adicionalmente, o professor pode revogar as permissões concedidas ao aplicativo a qualquer momento pela página de segurança da sua própria Conta Google em <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">myaccount.google.com/permissions</a>.
                </p>
              </div>
            </div>
          </section>

          {/* Seção 10 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold">4</span>
              Compartilhamento de Dados com Terceiros
            </h2>
            <p>
              O EAVRA não comercializa dados pessoais. O compartilhamento ocorre apenas com os provedores de infraestrutura essenciais para a operação tecnológica do sistema:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-zinc-600 text-xs sm:text-sm">
              <li><strong>Supabase Inc.:</strong> Provedor de banco de dados em nuvem, controle de permissões e autenticação criptografada de usuários;</li>
              <li><strong>Google LLC (Google Calendar API):</strong> Apenas quando o professor conecta voluntariamente sua agenda para envio das aulas;</li>
              <li><strong>WhatsApp / Meta:</strong> Apenas na abertura de link de conversa pelo dispositivo do usuário para envio manual de confirmações.</li>
            </ul>
          </section>

          {/* Seção 11 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold">5</span>
              Armazenamento e Segurança da Informação
            </h2>
            <p>
              Adotamos medidas técnicas e organizacionais rígidas para resguardar a integridade, disponibilidade e confidencialidade dos dados pessoais:
            </p>
            <ul className="list-disc list-inside space-y-1 text-zinc-600 text-xs sm:text-sm">
              <li>Tráfego integral de dados sob protocolo criptográfico TLS/HTTPS com certificados válidos;</li>
              <li>Controle de acesso por funções (RBAC - Role-Based Access Control) garantindo que professores acessem apenas suas próprias turmas e alunos;</li>
              <li>Tokens e segredos de clientes gerenciados exclusivamente no servidor (Server-Side), sem exposição no código do cliente ou no navegador;</li>
              <li>Sessões autenticadas com expiração por inatividade e monitoramento em tempo real de acessos bloqueados.</li>
            </ul>
          </section>

          {/* Seção 12 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold">6</span>
              Retenção e Exclusão de Dados
            </h2>
            <p>
              Os dados pessoais são mantidos pelo período estritamente necessário para cumprir as finalidades educacionais e contratuais, ou para o cumprimento de obrigações legais e regulatórias (como guarda de registros acadêmicos e fiscais).
            </p>
            <p>
              Mediante solicitação formal do titular ou após o encerramento do vínculo contratual, os dados poderão ser eliminados ou anonimizados, ressalvadas as hipóteses legais de conservação previstas no Artigo 16 da LGPD.
            </p>
          </section>

          {/* Seção 14 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold">7</span>
              Direitos dos Titulares de Dados (LGPD)
            </h2>
            <p>
              Em conformidade com o Artigo 18 da Lei Geral de Proteção de Dados, os titulares de dados pessoais tratados pelo EAVRA têm o direito de solicitar a qualquer momento:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
              <div className="p-3 bg-white rounded-lg border border-zinc-200">✓ Confirmação da existência de tratamento;</div>
              <div className="p-3 bg-white rounded-lg border border-zinc-200">✓ Acesso aos dados pessoais tratados;</div>
              <div className="p-3 bg-white rounded-lg border border-zinc-200">✓ Correção de dados incompletos ou inexatos;</div>
              <div className="p-3 bg-white rounded-lg border border-zinc-200">✓ Eliminação de dados desnecessários ou excessivos;</div>
              <div className="p-3 bg-white rounded-lg border border-zinc-200">✓ Portabilidade de dados a outro fornecedor;</div>
              <div className="p-3 bg-white rounded-lg border border-zinc-200">✓ Revogação do consentimento concedido.</div>
            </div>
          </section>

          {/* Seção 15 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold">8</span>
              Cookies e Tecnologias Semelhantes
            </h2>
            <p>
              O aplicativo EAVRA utiliza unicamente o armazenamento local seguro do navegador (como <code>localStorage</code>) para finalidades estritamente técnicas, necessárias para o funcionamento da aplicação, como a manutenção da sessão ativa de autenticação e a persistência de preferências de tela durante o uso. <strong>A plataforma não utiliza cookies de rastreamento de terceiros nem pixels de publicidade.</strong>
            </p>
          </section>

          {/* Seção 16 & 17 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold">9</span>
              Alterações desta Política de Privacidade
            </h2>
            <p>
              Esta Política de Privacidade poderá ser atualizada periodicamente para refletir aprimoramentos técnicos, novas funcionalidades ou atualizações normativas. A data da versão mais recente estará sempre indicada no topo desta página.
            </p>
          </section>

          <section className="space-y-3 pb-8">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold">10</span>
              Canal de Contato e Dúvidas
            </h2>
            <p>
              Para esclarecer dúvidas sobre esta Política de Privacidade ou para exercer qualquer um dos seus direitos como titular de dados pessoais perante a LGPD, entre em contato através do canal oficial:
            </p>
            <div className="p-4 bg-white rounded-xl border border-zinc-200 text-xs sm:text-sm space-y-1">
              <p><strong>Canal de Atendimento de Privacidade:</strong> institutodeartera@gmail.com</p>
              <p><strong>Domínio Oficial:</strong> institutoiacra.com.br</p>
              <p><strong>Encarregado pelo Tratamento de Dados (DPO):</strong> Raphael Augusto</p>
            </div>
          </section>
        </div>

        {/* Rodapé da página */}
        <footer className="mt-12 pt-8 border-t border-zinc-200 text-center text-xs text-zinc-500 space-y-2">
          <p>© {new Date().getFullYear()} EAVRA — INSTITUTO DE ARTE E VOCAL RAPHAEL AUGUSTO. Todos os direitos reservados.</p>
          <p>
            <button
              onClick={handleBack}
              className="text-indigo-600 hover:text-indigo-800 underline font-medium"
            >
              Retornar ao Sistema
            </button>
          </p>
        </footer>
      </main>
    </div>
  );
};
