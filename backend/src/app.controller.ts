import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  
  @Get('clmm-pools')
  async getClmmPools() {
    try {
      // Получаем пулы через REST API
      const response = await fetch('https://api.raydium.io/v2/main/clmm-pools');
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      const data = await response.json();
      
      return {
        success: true,
        pools: data.data || [],
      };
    } catch (error) {
      return {
        success: false,
        error: `Не удалось получить список пулов: ${error.message}`,
      };
    }
  }
}
