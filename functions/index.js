import { setGlobalOptions } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp, firestore } from "firebase-admin";
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { onCall, HttpsError } from "firebase-functions/v2/https";

initializeApp();

setGlobalOptions({ maxInstances: 10, region: "us-central1" });
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

export const hookMercadoPago = onRequest({ cors: true }, async (req, res) => {
    // O Mercado Pago envia o ID do pagamento no corpo ou na query
    const paymentId = req.body.data?.id || req.query['data.id'];

    if (req.body.type === "payment" && paymentId) {
        try {
            const payment = new Payment(client);
            const result = await payment.get({ id: paymentId });

            // Se o status mudou para aprovado
            if (result.status === 'approved') {
                // Lembra do metadata que a gente colocou na outra função?
                const userId = result.metadata.user_id;

                if (userId) {
                    const expira = new Date();
                    expira.setMonth(expira.getMonth() + 1);

                    await firestore().collection("perfis").doc(userId).update({
                        statusPagamento: "ativo",
                        expiraEm: expira,
                        ultimoPagamento: firestore.FieldValue.serverTimestamp(),
                        idTransacaoMP: result.id
                    });

                    console.log(`✅ Assinatura liberada para o usuário: ${userId}`);
                }
            }
        } catch (error) {
            console.error("Erro ao processar Webhook:", error);
        }
    }

    // O Mercado Pago exige que você responda 200 ou 201 sempre
    res.status(200).send("OK");
});
export const processarPagamento = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não logado.');
    }

    const data = request.data;
    const payment = new Payment(client);
    const valorDoSistema = 19.90;

    // Validação de segurança do valor
    if (parseFloat(data.amount) !== valorDoSistema) {
        console.error(`Tentativa de bypass de valor: ${request.auth.uid}`);
        throw new HttpsError('invalid-argument', 'Valor inconsistente.');
    }

    // MONTAGEM DINÂMICA DO BODY
    const body = {
        transaction_amount: valorDoSistema,
        description: data.description || "Plano Profissional Agenda Fácil",
        payment_method_id: data.payment_method_id,
        payer: {
            email: data.email,
            identification: {
                type: data.identificationType || "CPF",
                number: data.identificationNumber
            }
        },
        // Metadata é a chave para o Webhook saber quem pagou depois
        metadata: {
            user_id: request.auth.uid
        }
    };

    // Se for CARTÃO, adicionamos os campos específicos
    if (data.payment_method_id !== 'pix') {
        body.token = data.token;
        body.installments = parseInt(data.installments) || 1;
        body.issuer_id = data.issuer_id;
    }

    try {
        const result = await payment.create({ body });

        // 1. SE FOR CARTÃO E FOR APROVADO NA HORA
        if (result.status === 'approved') {
            const expira = new Date();
            expira.setMonth(expira.getMonth() + 1);

            await firestore().collection("perfis").doc(request.auth.uid).update({
                statusPagamento: "ativo",
                planoAtivo: body.description,
                expiraEm: expira,
                ultimoPagamento: firestore.FieldValue.serverTimestamp(),
                idTransacaoMP: result.id,
                metodoPagamento: result.payment_method_id
            });

            return { success: true, id: result.id, status: 'approved' };
        }

        // 2. SE FOR PIX (O status inicial é 'pending')
        if (result.payment_method_id === 'pix' && result.status === 'pending') {
            return {
                success: true,
                status: 'pending',
                id: result.id,
                // Dados para o seu pix-checkout.html
                qr_code: result.point_of_interaction.transaction_data.qr_code_base64,
                copy_paste: result.point_of_interaction.transaction_data.qr_code
            };
        }

        // 3. SE FOR RECUSADO
        return {
            success: false,
            status: result.status,
            detail: result.status_detail
        };

    } catch (error) {
        console.error("ERRO MP:", error);
        return {
            success: false,
            error: "Erro ao processar pagamento. Verifique os dados."
        };
    }
});