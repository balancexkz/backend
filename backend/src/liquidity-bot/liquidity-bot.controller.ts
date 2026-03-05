import { 
  Controller, 
  Post, 
  Body, 
  HttpException, 
  HttpStatus, 
  Get, 
  Param, 
  UseGuards, 
  Query 
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { LiquidityBotService } from './liquidity-bot.service';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth/guards';
import { SetupPositionDto } from './dto/setup-position.dto';
import { ClosePositionDto } from './dto/close-position.dto';
import {IncreasePositionDto} from './dto/increase-position'



@ApiTags('liquidity')
@Controller('liquidity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('JWT-auth')
export class LiquidityBotController {
  // Class-level @Roles('admin') covers all POST/mutating endpoints.
  // GET (read-only) endpoints override to allow 'vault' and 'pro' as well.
  constructor(
    private readonly liquidityBotService: LiquidityBotService,
  ) {}

  @Post('setup-position')
  @ApiOperation({ 
    summary: 'Открыть позицию ликвидности',
    description: 'Создает новую позицию в пуле Raydium CLMM с указанным диапазоном цен',
  })
  @ApiResponse({
    status: 201,
    description: 'Позиция успешно создана',
    schema: {
      example: {
        mint: '5HauEoJa6tcKBy1vofNAxnEDiMpC7H6V9L5TgLwFYNfd',
        txId: 'https://explorer.solana.com/tx/...',
        poolId: '2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Неверные параметры' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 500, description: 'Ошибка сервера' })
  async setupLiquidityPosition(@Body() params: SetupPositionDto) {
    try {
      const position = await this.liquidityBotService.setupLiquidityPosition(params);
      return position;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to set up liquidity position',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('close-position')
  @ApiOperation({ 
    summary: 'Закрыть позицию ликвидности',
    description: 'Закрывает существующую позицию и выводит все токены',
  })
  @ApiResponse({
    status: 200,
    description: 'Позиция успешно закрыта',
    schema: {
      example: {
        txId: 'https://explorer.solana.com/tx/...',
        success: true,
        baseAmount: 21.574620,
        quoteAmount: 8.705166,
        feesCollected: 17.65,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Позиция не найдена' })
  @ApiResponse({ status: 500, description: 'Ошибка сервера' })
  async closeLiquidityPosition(@Body() dto: ClosePositionDto) {
    try {
      const result = await this.liquidityBotService.closePosition(dto.nftMint);
      return result;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to close position',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('position/:nftMint')
  @Roles('admin', 'vault', 'pro')
  @ApiOperation({
    summary: 'Получить информацию о позиции',
    description: 'Возвращает детальную информацию о конкретной позиции',
  })
  @ApiParam({
    name: 'nftMint',
    description: 'NFT Mint адрес позиции',
    example: '5HauEoJa6tcKBy1vofNAxnEDiMpC7H6V9L5TgLwFYNfd',
  })
  @ApiResponse({
    status: 200,
    description: 'Информация о позиции',
    schema: {
      example: {
        position: {
          positionId: '5HauEoJa...',
          baseAmount: '21.526289',
          quoteAmount: '0.000000',
          priceRange: { lower: 154.63, upper: 161.81 },
          currentPrice: 162.27,
          profitability: 5.23,
        },
        pool: {
          poolId: '2Qdhep...',
          baseMint: 'SOL',
          quoteMint: 'USDC',
          currentPrice: 162.27,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Позиция не найдена' })
  async getPositionInfo(@Param('nftMint') nftMint: string) {
    try {
      const positionInfo = await this.liquidityBotService.fetchPositionInfo(nftMint);
      return positionInfo;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch position info',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('positions')
  @ApiOperation({ 
    summary: 'Получить все позиции',
    description: 'Возвращает список всех активных позиций пользователя',
  })
  @ApiResponse({
    status: 200,
    description: 'Список позиций',
    schema: {
      example: [
        {
          position: {
            positionId: '5HauEoJa...',
            baseAmount: '21.526289',
            quoteAmount: '0.000000',
          },
          pool: {
            poolId: '2Qdhep...',
            baseMint: 'SOL',
            quoteMint: 'USDC',
          },
        },
      ],
    },
  })
  async getAllPositionInfo() {
    try {
      const positionInfo = await this.liquidityBotService.getCLMMPositions();
      return positionInfo;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch positions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('positions/wallet')
  @ApiOperation({ 
    summary: 'Получить все позиции кошелька',
    description: 'Возвращает все позиции из подключенного кошелька',
  })
  @ApiResponse({ status: 200, description: 'Список позиций' })
  async getAllPositionsFromWallet() {
    try {
      const positionInfo = await this.liquidityBotService.getCLMMPositions();
      return positionInfo;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch wallet positions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('pool/:poolId')
  @ApiOperation({ 
    summary: 'Получить информацию о пуле',
    description: 'Возвращает детали пула ликвидности',
  })
  @ApiParam({
    name: 'poolId',
    description: 'ID пула',
    example: '2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv',
  })
  @ApiResponse({
    status: 200,
    description: 'Информация о пуле',
    schema: {
      example: {
        id: '2Qdhep...',
        mintA: { symbol: 'SOL', decimals: 9 },
        mintB: { symbol: 'USDC', decimals: 6 },
        price: 162.27,
        tvl: 5234567.89,
      },
    },
  })
  async getPoolInfo(@Param('poolId') poolId: string) {
    try {
      const poolInfo = await this.liquidityBotService.getPoolInfo(poolId);
      return poolInfo;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch pool info',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('token/price')
  @ApiOperation({ 
    summary: 'Получить цены токенов',
    description: 'Возвращает текущие цены указанных токенов в USD',
  })
  @ApiQuery({
    name: 'symbols',
    description: 'Символы токенов через запятую',
    example: 'SOL,USDC,USDT',
  })
  @ApiResponse({
    status: 200,
    description: 'Цены токенов',
    schema: {
      example: {
        SOL: 162.27,
        USDC: 1.00,
        USDT: 1.00,
      },
    },
  })
  async getTokenPrice(@Query('symbols') symbols: string) {
    try {
      const prices = await this.liquidityBotService.getTokenPrices(symbols);
      return prices;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch token prices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('pool/balance/:poolId')
  @ApiOperation({ 
    summary: 'Получить балансы токенов пула',
    description: 'Возвращает текущие балансы токенов в указанном пуле',
  })
  @ApiParam({
    name: 'poolId',
    description: 'ID пула',
    example: '2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv',
  })
  @ApiResponse({
    status: 200,
    description: 'Балансы токенов',
    schema: {
      example: {
        SOL: { amount: 21.526289, symbol: 'SOL' },
        USDC: { amount: 3842.701244, symbol: 'USDC' },
      },
    },
  })
  async getPoolBalance(@Param('poolId') poolId: string) {
    try {
      const poolInfo = await this.liquidityBotService.getBalanceByPool(poolId);
      return poolInfo;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch pool balance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  @Post('increase')
  async increaseLiquidity(@Body() dto: IncreasePositionDto){
    try{
      const response = await this.liquidityBotService.increaseLiquidity(dto.nftMint, dto.inputAmount)

    }
    catch(error){
      throw new HttpException(
        error.message || 'Failed to fetch pool balance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

  }

  @Get('density')
  async getDensityForPosition(
  ) {
    return await this.liquidityBotService.getLiquidityDensityForPosition(
    );
  }
}