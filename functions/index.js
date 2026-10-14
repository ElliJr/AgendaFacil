import { setGlobalOptions } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { MercadoPagoConfig, Payment } from "mercadopago";

initializeApp();

setGlobalOptions({ maxInstances: 10, region: "us-central1" });

const db = getFirestore();
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN 
});

// ====================== WEBHOOK MERCADO PAGO ======================
export const hookMercadoPago = onRequest({ cors: true }, async (req, res) => {
  const paymentId = req.body?.data?.id || req.query["data.id"];

  if (req.body?.type === "payment" && paymentId) {
    try {
      const payment = new Payment(client);
      const result = await payment.get({ id: paymentId });

      if (result.status === "approved") {
        const userId = result.metadata?.user_id;

        if (userId) {
          const expira = new Date();
          expira.setMonth(expira.getMonth() + 1);

          await db.collection("perfis").doc(userId).update({
            statusPagamento: "ativo",
            expiraEm: expira,
            ultimoPagamento: FieldValue.serverTimestamp(),
            idTransacaoMP: result.id,
            metodoPagamento: result.payment_method_id || null
          });

          console.log(`Assinatura liberada para o usuário: ${userId}`);
        }
      }
    } catch (error) {
      console.error("Erro ao processar Webhook:", error);
    }
  }

  // Sempre responde 200 para o Mercado Pago
  res.status(200).send("OK");
});

// ====================== PROCESSAR PAGAMENTO ======================
export const processarPagamento = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Usuário não logado.");
  }

  const data = request.data;
  const payment = new Payment(client);
  const valorDoSistema = 90.90; // valor oficial do plano

  // Validação de segurança do valor
  if (parseFloat(data.amount) !== valorDoSistema) {
    console.error(`Tentativa de bypass de valor: ${request.auth.uid}`);
    throw new HttpsError("invalid-argument", "Valor inconsistente.");
  }

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
    metadata: {
      user_id: request.auth.uid
    }
  };

  // Campos específicos de cartão
  if (data.payment_method_id !== "pix") {
    body.token = data.token;
    body.installments = parseInt(data.installments) || 1;
    body.issuer_id = data.issuer_id;
  }

  try {
    const result = await payment.create({ body });

    // 1. Cartão aprovado na hora
    if (result.status === "approved") {
      const expira = new Date();
      expira.setMonth(expira.getMonth() + 1);

      await db.collection("perfis").doc(request.auth.uid).update({
        statusPagamento: "ativo",
        planoAtivo: body.description,
        expiraEm: expira,
        ultimoPagamento: FieldValue.serverTimestamp(),
        idTransacaoMP: result.id,
        metodoPagamento: result.payment_method_id
      });

      return { success: true, id: result.id, status: "approved" };
    }

    // 2. PIX (fica pending)
    if (result.payment_method_id === "pix" && result.status === "pending") {
      return {
        success: true,
        status: "pending",
        id: result.id,
        qr_code: result.point_of_interaction?.transaction_data?.qr_code_base64,
        copy_paste: result.point_of_interaction?.transaction_data?.qr_code
      };
    }

    // 3. Recusado
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