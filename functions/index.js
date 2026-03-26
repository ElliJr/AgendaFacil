import { setGlobalOptions } from "firebase-functions";
import { initializeApp, firestore } from "firebase-admin";
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { onCall, HttpsError } from "firebase-functions/v2/https";
// Inicializa o Admin SDK do Firebase
initializeApp();

// Configurações globais para economizar recursos (Plano Blaze)
setGlobalOptions({ maxInstances: 10, region: "us-central1" });

// CONFIGURAÇÃO DO MERCADO PAGO
// Importante: Substitua pelo seu Access Token REAL que você pegou no painel do MP
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN, 
    options: { timeout: 10000 } 
});

export const processarPagamento = onCall({ cors: true}, async (request) => {
    // Restante do seu código igual...
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não logado.');
    }

    const data = request.data; 
    const payment = new Payment(client);
    const valorDoSistema = 19.90; // Valor fixo do plano PRO

    if(parseFloat(data.amount) !== valorDoSistema) {
        console.error(`Ta tentando oque mano 😡: ${request.auth.uid}`);
        throw new HttpsError('invalid-argument', 'Valor do pagamento inconsiste com o plano de pagamento.');
    }

    // Montagem do corpo do pagamento conforme API v2 do Mercado Pago
    const body = {
        transaction_amount: valorDoSistema,
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
            const userRef = firestore().collection("perfis").doc(request.auth.uid);
            
            await userRef.update({
                statusPagamento: "ativo",
                planoAtivo: data.description,
                expiraEm: expira,
                ultimoPagamento: firestore.FieldValue.serverTimestamp(),
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