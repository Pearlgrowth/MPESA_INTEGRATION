import express from "express";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send(`<h1> the app is running on port: ${port}</h1>`);
});


//IMPORTANT:
//the consumer key and secret are obtained after you log in to Daraja and you create an app.
//if you go live the mpesa environment just changes to live..if testing it is sandbox
//you get new shortcode and passkeys sent to your email,

//this is the business shortcode(Party B)
//it is a constant shortcode for sandbox.
//when you go to production, it will be the paybill.
//when you apply for paybill number, you also get a store number,,the store number will be the shortcode
//for till it will be the till number itself

//to get the passkey, go to APIS then Mpesa EXpress then simulate..search for your app..you will find the passkey, copy and paste it here.
//when you go to production, the pass key will not be in the daraja portal it will be sent to youe email address



//apis
//authorization api for mpesa..it is the api that you use to get the token that is to be used for other services
//you call it before any other APIS
//it is like the middleware
const middleWare = async (req, res, next) => {
  const MPESA_BASE_URL =
    process.env.MPESA_ENVIRONMENT === "live"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  //the token from authorization goes in here
  try {
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const resp = await axios.get(
      `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          authorization: `Basic ${auth}`,
        },
      }
    );

    req.mpesaToken = resp.data.access_token;
    next();
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
};

//stk push
app.post("/stk", middleWare, async (req, res) => {
  // accessing the token
  // res.json(req.mpesaToken)
  //when you test using thunder client you get the token:"vbj6TINXsqB9a0BUhGy1gA9fFuQt"
  const { phoneNumber, amount } = req.body;
  //we then initiate the stk push
  try {
    const MPESA_BASE_URL =
      process.env.MPESA_ENVIRONMENT === "live"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";
    const date = new Date();

    //you can use a library to generate the time stamp or do it manually
    const timestamp =
      date.getFullYear() +
      ("0" + (date.getMonth() + 1)).slice(-2) +
      ("0" + date.getDate()).slice(-2) +
      ("0" + date.getHours()).slice(-2) +
      ("0" + date.getMinutes()).slice(-2) +
      ("0" + date.getSeconds()).slice(-2);

    const password = Buffer.from(
      process.env.MPESA_SHORTCODE + process.env.MPESA_PASSKEY + timestamp
    ).toString("base64");
    //here we validate the phone number so that the user can enter their phone number in whatever format they want,you just validate it.
    const formattedPhoneNumber = `254${phoneNumber.slice(-9)}`; //take the phone number provided and take the last nine digits

    const response = await axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE, //store number for tills
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline", //CustomerBuyGoodsOnline - for till, first lettter of each must be capital
        Amount: amount,
        PartyA: formattedPhoneNumber,
        PartyB: process.env.MPESA_SHORTCODE, //till number for tills
        PhoneNumber: formattedPhoneNumber,
        CallBackURL: "https://mydomain.com/callback-url-path",
        AccountReference: phoneNumber,
        TransactionDesc: "anything here",
      },
      {
        headers: {
          Authorization: `Bearer ${req.mpesaToken}`,
        },
      }
    );
    return res
      .status(200)
      .json({
        message: `stk sent successfully to ${phoneNumber}`,
        data: response.data,
      });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

//stk query
//checks the status of a pending or completed stk push transcation.
//you get response codes that tell you if the push is successful or not
// 0	Transaction Successful
// 1037	Transaction Timeout
// 2001	Wrong Transaction Details
// 1	Insufficient Funds
// 1032	Transaction Cancelled by User
// 1033	User did not respond
// 1002	Invalid Paybill or Till Number
app.post("/stkquery", middleWare, async (req, res) => {
  const reqId = req.body.reqId;//this is the CheckoutRequestId that tells you the state of the stk push that is generated when you make the push
  try {
    const MPESA_BASE_URL =
      process.env.MPESA_ENVIRONMENT === "live"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";
    const date = new Date();

    //you can use a library to generate the time stamp or do it manually
    const timestamp =
      date.getFullYear() +
      ("0" + (date.getMonth() + 1)).slice(-2) +
      ("0" + date.getDate()).slice(-2) +
      ("0" + date.getHours()).slice(-2) +
      ("0" + date.getMinutes()).slice(-2) +
      ("0" + date.getSeconds()).slice(-2);
      const password = Buffer.from(
        process.env.MPESA_SHORTCODE + process.env.MPESA_PASSKEY + timestamp
      ).toString("base64");

    const response = await axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: reqId,
      },
      {
        headers: {
          Authorization: `Bearer ${req.mpesaToken}`,
        },
      }
    );
    return res
      .status(200)
      .json({
        data: response.data,
      });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});
//this is the output of stk query:
// {
//   "data": {
//     "ResponseCode": "0",
//     "ResponseDescription": "The service request has been accepted successsfully",
//     "MerchantRequestID": "b54f-471d-93d9-f7f3bf3f7c0e2101016",
//     "CheckoutRequestID": "ws_CO_29012025122430700727987765",
//     "ResultCode": "1032",
//     "ResultDesc": "Request cancelled by user"
//   }
// }

//callbackurl
//for security purposes: define the callbackurlpath in the .env file to avoid people checking out from your website 
app.post('/callback-url-path',(req,res)=>{
  //try using ngrok for web hooking to see if it will still work.
console.log(req.body.Body.stkCallback.CallbackMetadata)
//this maes sure u only send one stk push and not another one

//for security you can also do IP WHITELISTING
//you can get the whitelisted IPS from daraja..under: DOCS> Going Live> Callback and IP WHitelisting
const validIps= [
  "abcdabcd"
]
if(validIps.includes(reqIp)){
//perform logic
}
else{
  //end the valid ip logic so meaning it is an invalid transaction or insecure
}

//also for security you can have a unique identifier..most reliable method
// the unique identifier is passed to the end of the url
const unique= "adnhhnfnkkkjjjhhv"
if(unique !== req.body.unique){

}
res.status(200).send("")
//add the logic that you want up there.
})


//b2c b2b: have the user initiator password
//to get the password..go to your app then test credentials, enter value then click generate..choose the environment


//doing b2c which is most common:
// B2C ROUTE OR AUTO WITHDRAWAL
app.post("/b2c", middleWare, async(req,res)=>{
  const { phoneNumber, amount } = req.body;
  //you can store this in .env file when in production for security ig
  //accessed from simulator under b2c 
   const securityCredential = "ENcu5FJkbO9uDxj1OnafJJO33dXRsLRTF6ehk+OPhOCEYiCzQ/zEBQRD/Df2jp6YRSoHg1qXA/v/n4645c4rfCY+NIPB+3onMoO1kcKnuhPdeiU48IKHwkqcOheJFaAOYZzJQ9ExCQle+wmhyKjCo1Da2eZq/nb3Y9/rTIgvvOSNzbPLTY1k1DMjjBGjL4Wq1BUrLBt5NlOU/F784MGmNSiCKk0gEHquQ67t7uqmWML8O2qAGJ8dcXWvO5k52SGw6pejCUj2qU7GlmadabCmxDM/uU3DXME8CeD8n6MOCq0OWm4hef/vVDmU8sn2gEnTQso0+ANlbmamP2OlgIwHqQ=="
    try {
    const MPESA_BASE_URL =
      process.env.MPESA_ENVIRONMENT === "live"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

        const formattedPhoneNumber = `254${phoneNumber.slice(-9)}`; //take the phone number provided and take the last nine digits
      const response = await axios.post (
        `${MPESA_BASE_URL}/mpesa/b2c/v1/paymentrequest`,
        {
            OriginatorConversationID: "1969f37b-2a47-48fd-aab6-0865ae06497d",
            InitiatorName: "testapi",
            SecurityCredential: securityCredential,
            CommandID: "PromotionPayment",//there are 3 commandId:salarypayment, business and promotion payment
            Amount: amount,
            PartyA: "600987",//accessed from simulator under b2c api
            PartyB: formattedPhoneNumber,//phone number to receive the stk push:should have the country code (254) without the plus sign.
            Remarks: "Withdrawal",
            //both urls in prod is the domain where you want it to be
            QueueTimeOutURL: "https://mydomain.com/b2c/queue",
            ResultURL: "https://mydomain.com/b2c/result",
            Occasion: "Withdrawal",
        },
        {
          headers: {
            Authorization: `Bearer ${req.mpesaToken}`,
          },
        }
      )
      return res
      .status(200)
      .json({
        data: response.data,
      });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
})

//correct output for b2c:
// {
//   "data": {
//     "ConversationID": "AG_20250202_201055f2b86289cada9d",
//     "OriginatorConversationID": "b54f-471d-93d9-f7f3bf3f7c0e2249790",
//     "ResponseCode": "0",
//     "ResponseDescription": "Accept the service request successfully."
//   }
// }
const port = process.env.PORT || "8080";
app.listen(port, () => `Server is listening on port: ${port}`);
