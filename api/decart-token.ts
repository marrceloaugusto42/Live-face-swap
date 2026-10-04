import {createDecartClient} from "@decartai/sdk";

export default async function handler(req:any,res:any){
  if(req.method!=="POST"){
    res.status(405).json({error:"Method not allowed"});
    return;
  }
  const apiKey=process.env.DECART_API_KEY;
  if(!apiKey){
    res.status(503).json({error:"DECART_API_KEY is not configured on this Vercel project."});
    return;
  }
  try{
    const client=createDecartClient({apiKey});
    const token=await client.tokens.create({
      expiresIn:300,
      metadata:{service_tier:0}
    });
    res.status(200).json({apiKey:token.apiKey,expiresAt:token.expiresAt});
  }catch(error){
    console.error("Decart token creation failed",error);
    res.status(502).json({error:"Unable to create a realtime AI client token."});
  }
}
