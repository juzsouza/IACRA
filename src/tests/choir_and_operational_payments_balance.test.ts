import assert from 'node:assert/strict';
import {
  filterBillingItemsForView,
  resolveStudentChoirRegistration
} from '../views/Payments';

async function runTests() {
  console.log('================================================================');
  console.log('TESTES: REGRA OPERACIONAL DE PAGAMENTOS E COBRANÇAS DE CORAL');
  console.log('================================================================\n');

  // =========================================================================
  // TESTE 1: Resolução de Inscrição no Coral com Prioridade para Aprovada
  // (Caso Lucas Torres Guerra: inscrição rejeitada antiga não pode mascarar aprovada recente)
  // =========================================================================
  console.log('[Teste 1] Resolução de Inscrição: priorizar inscrição aprovada sobre rejeitada...');
  {
    const studentLucasId = 'ae0089a5-3243-48fe-9d3a-915027427f87';
    const mockChoirRegs = [
      {
        id: '6a9390c7-0293-4f08-abb4-29c9a3241835',
        student_id: studentLucasId,
        status: 'rejected',
        monthly_fee: 30,
        created_at: '2026-07-08T20:38:35.188341+00:00',
      },
      {
        id: 'b8400c23-0239-47d9-a770-800c6fc7f5cd',
        student_id: studentLucasId,
        status: 'approved',
        monthly_fee: 42,
        created_at: '2026-10-02T19:49:11.918236+00:00',
      },
    ];

    const resolved = resolveStudentChoirRegistration(studentLucasId, mockChoirRegs);
    assert.ok(resolved, 'Deve retornar uma inscrição');
    assert.equal(resolved.id, 'b8400c23-0239-47d9-a770-800c6fc7f5cd', 'Deve escolher a inscrição aprovada');
    assert.equal(resolved.status, 'approved', 'Status deve ser approved');
    assert.equal(resolved.monthly_fee, 42, 'Mensalidade deve ser R$ 42,00');
    console.log('  ✓ [OK] Inscrição aprovada foi corretamente priorizada e não foi mascarada pela rejeitada.\n');
  }

  // =========================================================================
  // TESTE 2: Coralista com monthly_fee = 0 → NÃO APARECE
  // =========================================================================
  console.log('[Teste 2] Coralista com monthly_fee = 0 (isento/waived) → NÃO aparece na listagem...');
  {
    const itemIsento = {
      id: 'student-isento-01',
      type: 'student' as const,
      name: 'Mayara Ribeiro Fernandes (Coral Isento)',
      totalAmount: 0,
      totalPaid: 0,
      totalPending: 0,
      paymentStatus: 'paid' as const,
      billing: {
        enrollmentsBilling: [],
        choirBilling: [],
      },
    };

    const toPayList = filterBillingItemsForView([itemIsento], 'to_pay');
    const allList = filterBillingItemsForView([itemIsento], 'all');
    const paidList = filterBillingItemsForView([itemIsento], 'paid');

    assert.equal(toPayList.length, 0, 'Não deve aparecer em "A Pagar"');
    assert.equal(allList.length, 0, 'Não deve aparecer em "Todos"');
    assert.equal(paidList.length, 0, 'Não deve aparecer em "Pagos" (totalAmount é 0)');
    console.log('  ✓ [OK] Coralista com valor R$ 0,00 não aparece em nenhuma listagem operacional.\n');
  }

  // =========================================================================
  // TESTE 3: Coralista pago integralmente → NÃO APARECE em "A Pagar"
  // =========================================================================
  console.log('[Teste 3] Coralista pago integralmente → NÃO aparece em "A Pagar", preservado em "Pagos"...');
  {
    const itemPago = {
      id: 'student-pago-01',
      type: 'student' as const,
      name: 'Isabella da Silva Marcolino (Coral Pago)',
      totalAmount: 42,
      totalPaid: 42,
      totalPending: 0,
      paymentStatus: 'paid' as const,
      billing: {
        enrollmentsBilling: [],
        choirBilling: [
          {
            monthlyFee: 42,
            isPaid: true,
            refLabel: '10/2026',
          },
        ],
      },
    };

    const toPayList = filterBillingItemsForView([itemPago], 'to_pay');
    const allList = filterBillingItemsForView([itemPago], 'all');
    const paidList = filterBillingItemsForView([itemPago], 'paid');

    assert.equal(toPayList.length, 0, 'Coralista pago integralmente NÃO pode aparecer em "A Pagar"');
    assert.equal(allList.length, 0, 'Coralista com saldo R$ 0,00 NÃO pode aparecer na listagem "Todos"');
    assert.equal(paidList.length, 1, 'Coralista pago DEVE ser preservado na aba histórica "Pagos"');
    console.log('  ✓ [OK] Coralista pago integralmente ocultado de "A Pagar" e "Todos", preservado em "Pagos".\n');
  }

  // =========================================================================
  // TESTE 4: Cobrança com 100% de desconto e saldo zero → NÃO APARECE na listagem operacional
  // =========================================================================
  console.log('[Teste 4] Cobrança com 100% de desconto e saldo zero → NÃO aparece na listagem operacional...');
  {
    // Caso Dayara: mensalidade com 100% de desconto (R$ 40 - R$ 40 = R$ 0,00 final, totalPending = 0)
    const itemDescontoTotal = {
      id: 'student-desc-total-01',
      type: 'student' as const,
      name: 'Dayara da Silva Cardoso (100% desconto Coral)',
      totalAmount: 0, // finalPrice é 0
      totalPaid: 0,
      totalPending: 0,
      paymentStatus: 'paid' as const,
      billing: {
        enrollmentsBilling: [],
        choirBilling: [],
      },
    };

    const toPayList = filterBillingItemsForView([itemDescontoTotal], 'to_pay');
    const allList = filterBillingItemsForView([itemDescontoTotal], 'all');

    assert.equal(toPayList.length, 0, 'Não pode aparecer em "A Pagar"');
    assert.equal(allList.length, 0, 'Não pode aparecer em "Todos"');
    console.log('  ✓ [OK] Cobrança com 100% de desconto e saldo zero é excluída da listagem operacional.\n');
  }

  // =========================================================================
  // TESTE 5: Coralista com saldo > 0 → APARECE com valor pendente
  // =========================================================================
  console.log('[Teste 5] Coralista com saldo > 0 → APARECE com valor pendente e elegível para "Baixar"...');
  {
    const itemPendente = {
      id: 'student-pendente-01',
      type: 'student' as const,
      name: 'Kelly Cristina de Paiva (Coral Pendente)',
      totalAmount: 42,
      totalPaid: 0,
      totalPending: 42,
      paymentStatus: 'pending' as const,
      billing: {
        enrollmentsBilling: [],
        choirBilling: [
          {
            monthlyFee: 42,
            isPaid: false,
            refLabel: '10/2026',
          },
        ],
      },
    };

    const toPayList = filterBillingItemsForView([itemPendente], 'to_pay');
    const allList = filterBillingItemsForView([itemPendente], 'all');
    const paidList = filterBillingItemsForView([itemPendente], 'paid');

    assert.equal(toPayList.length, 1, 'DEVE aparecer na aba "A Pagar"');
    assert.equal(allList.length, 1, 'DEVE aparecer na aba "Todos"');
    assert.equal(paidList.length, 0, 'NÃO deve aparecer na aba "Pagos"');
    assert.equal(toPayList[0].totalPending, 42, 'Saldo pendente deve ser R$ 42,00');
    console.log('  ✓ [OK] Coralista com saldo R$ 42,00 aparece nas abas operacionais com valor pendente.\n');
  }

  // =========================================================================
  // TESTE 6: Busca textual pelo termo "Coral" inclui membros do coral
  // =========================================================================
  console.log('[Teste 6] Busca pelo termo "Coral" ou "Coro" reconhece itens de choirBilling...');
  {
    const itemPendente = {
      id: 'student-pendente-01',
      type: 'student' as const,
      name: 'Kelly Cristina de Paiva',
      totalAmount: 42,
      totalPaid: 0,
      totalPending: 42,
      paymentStatus: 'pending' as const,
      billing: {
        enrollmentsBilling: [],
        choirBilling: [
          {
            monthlyFee: 42,
            isPaid: false,
            refLabel: '10/2026',
          },
        ],
      },
    };

    const searchCoral = filterBillingItemsForView([itemPendente], 'to_pay', 'Coral');
    assert.equal(searchCoral.length, 1, 'Busca por "Coral" deve retornar o coralista');

    const searchMensalidadeCoral = filterBillingItemsForView([itemPendente], 'to_pay', 'mensalidade coral');
    assert.equal(searchMensalidadeCoral.length, 1, 'Busca por "mensalidade coral" deve retornar o coralista');

    const searchCoro = filterBillingItemsForView([itemPendente], 'to_pay', 'coro');
    assert.equal(searchCoro.length, 1, 'Busca por "coro" deve retornar o coralista');

    const searchOutro = filterBillingItemsForView([itemPendente], 'to_pay', 'Violão');
    assert.equal(searchOutro.length, 0, 'Busca por termo não relacionado não deve retornar');
    console.log('  ✓ [OK] Filtro de busca textual reconhece itens de choirBilling com sucesso.\n');
  }

  console.log('================================================================');
  console.log('TODOS OS TESTES DE REGRA OPERACIONAL E CORAL PASSARAM COM SUCESSO!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('Erro nos testes:', err);
  process.exit(1);
});
