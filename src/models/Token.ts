import mongooseService from "../clients/mongoose";

interface CreateTokenDTO {
  sym?: string;
  name?: string;
  address: string;
  decimals?: number;
  blacklisted?: boolean;
}

class Token {
  Schema = mongooseService.getMongoose().Schema;

  tokenSchema = new this.Schema(
    {
      _id: String,
      address: String,
      name: String,
      sym: String,
      decimals: Number,
      blacklisted: Boolean,
    },
    { id: false }
  );

  Token = mongooseService.getMongoose().model("Tokens", this.tokenSchema);

  constructor() {
    // console.log('PairAtBlock constructor');
  }

  async addToken(fields: CreateTokenDTO) {
    const pairAtBlock = new this.Token({
      _id: fields.address,
      ...fields,
    });
    // only save if token is not in DB
    try {
      await pairAtBlock.save();
    } catch (error) {
      console.log(error);
    }

    return fields.address;
  }

  async getToken(address: string) {
    return this.Token.findOne({ _id: address }).exec();
  }
}

export default new Token();
