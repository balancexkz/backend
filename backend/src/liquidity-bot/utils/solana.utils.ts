import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
// Функция принимает либо массив чисел, либо строку, представляющую массив
export function createWalletFromSecretKey(secretKey: number[] | string): Keypair {
  let keypairBytes: number[];

  // Если передана строка, парсим её как JSON-массив
  if (typeof secretKey === 'string') {
    try {
      keypairBytes = JSON.parse(secretKey) as number[];
    } catch (error) {
      throw new Error(`Failed to parse secret key as JSON array: ${error.message}`);
    }
  } else {
    keypairBytes = secretKey;
  }

  // Проверяем длину массива (должно быть 64 байта)
  if (keypairBytes.length !== 64) {
    throw new Error(`Invalid secret key length: expected 64 bytes, got ${keypairBytes.length}`);
  }

  // Преобразуем массив чисел в Uint8Array
  const secretKeyUint8 = new Uint8Array(keypairBytes);
  const base58SecretKey = bs58.encode(secretKeyUint8);


  // Создаём Keypair из байтов
  return Keypair.fromSecretKey(secretKeyUint8);
}


export function getBase58PrivateKey(secretKey: number[]): string {
  // Проверяем длину массива (должно быть 64 байта)
  if (secretKey.length !== 64) {
    throw new Error(`Invalid secret key length: expected 64 bytes, got ${secretKey.length}`);
  }

  // Преобразуем массив чисел в Uint8Array
  const secretKeyUint8 = new Uint8Array(secretKey);

  // Кодируем в base58
  return bs58.encode(secretKeyUint8);
}

export function base58ToNumberArray(base58Key: string): number[] {
  try {
    // Декодируем Base58-строку в Uint8Array
    const secretKeyUint8 = bs58.decode(base58Key);

    // Проверяем длину (должно быть 64 байта для Solana Keypair)
    if (secretKeyUint8.length !== 64) {
      throw new Error(`Invalid secret key length: expected 64 bytes, got ${secretKeyUint8.length}`);
    }

    // Преобразуем Uint8Array в обычный массив чисел
    return Array.from(secretKeyUint8);
  } catch (error) {
    throw new Error(`Failed to decode Base58 key: ${error.message}`);
  }
}

// Пример использования:
