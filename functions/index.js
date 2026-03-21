const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions");
const admin = require("firebase-admin");
const { MercadoPagoConfig, Payment } = require('mercadopago');

// Inicializa o Admin SDK do Firebase
admin.initializeApp();

// Configurações globais para economizar recursos (Plano Blaze)
setGlobalOptions({ maxInstances: 10, region: "us-central1" });

// CONFIGURAÇÃO DO MERCADO PAGO
// Importante: Substitua pelo seu Access Token REAL que você pegou no painel do MP
const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-4622444396438923-032022-fb8b8ec8f8ae891918be16bfeccf9992-3281358589', 
    options: { timeout: 10000 } 
});

exports.processarPagamento = onCall(async (request) => {
    // 1. Verificação de Segurança: O usuário está logado?
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'O usuário precisa estar logado para realizar o pagamento.');
    }

    const data = request.data; 
    const payment = new Payment(client);

    // Montagem do corpo do pagamento conforme API v2 do Mercado Pago
    const body = {
        transaction_amount: parseFloat(data.amount),
        token: data.token,
        description: data.description,
        installments: parseInt(data.installments),
        payment_method_id: data.payment_method_id,
        issuer_id: data.issuer_id,
        payer: {
            email: data.email,
            identification: {
                type: data.identificationType,
                number: data.identificationNumber
            }
        }
    };

    try {
        const result = await payment.create({ body });
        
        // 2. Verificação: O pagamento foi aprovado pelo banco?
        if (result.status === 'approved') {
            const expira = new Date();
            expira.setMonth(expira.getMonth() + 1); // Adiciona 30 dias de acesso

            // ATUALIZA O PERFIL DO BARBEIRO NO FIRESTORE
            const userRef = admin.firestore().collection("perfis").doc(request.auth.uid);
            
            await userRef.update({
                statusPagamento: "ativo",
                planoAtivo: data.description,
                expiraEm: expira,
                ultimoPagamento: admin.firestore.FieldValue.serverTimestamp(),
                valorAssinatura: data.amount,
                idTransacaoMP: result.id,
                metodoPagamento: result.payment_method_id
            });

            return { success: true, id: result.id, status: 'approved' };
        } else {
            // Se o cartão for recusado (falta de limite, bloqueio, etc)
            return { 
                success: false, 
                status: result.status, 
                detail: result.status_detail 
            };
        }
    } catch (error) {
        console.error("ERRO CRÍTICO NO MERCADO PAGO:", error);
        // Retorna um erro amigável para o seu checkout.html
        return { 
            success: false, 
            error: "Não conseguimos processar seu cartão. Verifique os dados e tente novamente." 
        };
    }
});