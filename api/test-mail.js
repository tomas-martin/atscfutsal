import SibApiV3Sdk from "sib-api-v3-sdk";

export default async function handler(req, res) {
  try {
    const client = SibApiV3Sdk.ApiClient.instance;
    const apiKey = client.authentications["api-key"];

    apiKey.apiKey = process.env.BREVO_API_KEY;

    const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

    await tranEmailApi.sendTransacEmail({
      sender: {
        email: "subcomision.atsc@gmail.com",
        name: "Andes Talleres",
      },
      to: [{ email: "subcomision.atsc@gmail.com" }],
      subject: "Prueba de mail",
      htmlContent: "<h1>Funciona Brevo ✅</h1>",
    });

    res.status(200).send("Mail enviado");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error enviando mail");
  }
}