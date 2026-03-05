// Скрипт для тестирования Raydium SDK напрямую
const { Connection } = require('@solana/web3.js');
const { Raydium } = require('@raydium-io/raydium-sdk-v2');

async function initRaydium() {
  try {
    console.log('Initializing Raydium SDK...');
    
    // Создаем соединение с Solana, используя публичную точку доступа
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    
    // Инициализируем Raydium SDK
    const raydium = await Raydium.load({
      connection,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });
    
    console.log('SDK initialized successfully');
    
    // Выводим доступные методы API
    console.log('API Methods:', Object.keys(raydium.api || {}).join(', '));
    
    // Проверяем доступные методы CLMM
    console.log('CLMM Methods:', Object.keys(raydium.clmm || {}).join(', '));
    
    // Проверяем вложенные методы CLMM
    for (const method in raydium.clmm) {
      console.log(`CLMM ${method} type:`, typeof raydium.clmm[method]);
    }
    
    try {
      // Получаем информацию о пуле
      console.log('\nFetching pool info...');
      
      // Известный ID пула (RAY-USDC)
      const poolId = 'DiwsGxJYoRZURvyCtMsJVyxR86yZBBbSYeeWNm7YCmT6';
      const poolData = await raydium.clmm.getPoolInfoFromRpc(poolId);
      
      console.log('Pool info successfully retrieved');
      
      // Выводим структуру данных
      console.log('\nPool data structure:');
      console.log('- poolInfo:', Object.keys(poolData.poolInfo || {}).join(', '));
      console.log('- poolKeys:', Object.keys(poolData.poolKeys || {}).join(', '));
      console.log('- computePoolInfo:', Object.keys(poolData.computePoolInfo || {}).join(', '));
      console.log('- tickData available:', !!poolData.tickData);
      
      // Выводим информацию о токенах в пуле
      if (poolData.poolInfo && poolData.poolInfo.mintA && poolData.poolInfo.mintB) {
        console.log('\nPool Tokens:');
        console.log('- Token A:', poolData.poolInfo.mintA.address);
        console.log('- Token B:', poolData.poolInfo.mintB.address);
      }
      
      // Проверяем, можем ли мы собрать CLMM пулы
      console.log('\nChecking if we can get all CLMM pools...');
      try {
        // Попробуем через официальное API Raydium
        const response = await fetch('https://api.raydium.io/v2/clmm/pools');
        if (response.ok) {
          const data = await response.json();
          console.log(`Found ${data.data?.length || 0} pools via direct API call`);
        } else {
          console.log(`API call failed with status: ${response.status}`);
        }
      } catch (apiError) {
        console.error('Error calling Raydium API:', apiError.message);
      }
    } catch (error) {
      console.error('Error fetching pool info:', error.message);
    }
    
    return raydium;
  } catch (error) {
    console.error('Error initializing SDK:', error.message);
    return null;
  }
}

// Запускаем инициализацию и тесты
initRaydium(); 