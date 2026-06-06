<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AsignacionDiaria;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class AsignacionController extends Controller
{
    #[OA\Get(
        path: '/asignacion/hoy',
        summary: 'Obtener la asignación activa de hoy para el vendedor autenticado',
        security: [['sanctum' => []]],
        tags: ['Asignaciones'],
        responses: [
            new OA\Response(response: 200, description: 'Asignación de hoy', content: new OA\JsonContent(ref: '#/components/schemas/AsignacionHoyResponse')),
            new OA\Response(response: 401, description: 'No autenticado'),
            new OA\Response(response: 403, description: 'Acceso denegado: no es vendedor'),
        ],
    )]
    /**
     * Retorna la asignación activa de hoy para el vendedor autenticado,
     * incluyendo los productos con cantidades.
     */
    public function hoy(Request $request): JsonResponse
    {
        $vendedor = $request->user()->vendedor;

        if (! $vendedor) {
            return response()->json([
                'message' => 'Este usuario no tiene perfil de vendedor.',
            ], 403);
        }

        $asignacion = AsignacionDiaria::with([
            'detalles.producto:id,nombre,codigo,unidad_medida,precio_venta,imagen,precios_cuotas',
        ])
        ->where('vendedor_id', $vendedor->id)
        ->where('fecha', today())
        ->where('estado', 'activa')
        ->first();

        if (! $asignacion) {
            return response()->json([
                'message'    => 'No hay asignación activa para hoy.',
                'asignacion' => null,
            ]);
        }

        return response()->json([
            'asignacion' => [
                'id'           => $asignacion->id,
                'fecha'        => $asignacion->fecha->toDateString(),
                'estado'       => $asignacion->estado,
                'sucursal_id'  => $asignacion->sucursal_id,
                'observaciones'=> $asignacion->observaciones,
                'productos'    => $asignacion->detalles->map(fn ($d) => [
                    'id'                => $d->id,
                    'producto_id'       => $d->producto_id,
                    'nombre'            => $d->producto?->nombre,
                    'codigo'            => $d->producto?->codigo,
                    'unidad_medida'     => $d->producto?->unidad_medida,
                    'precio_venta'      => $d->precio_venta ?? $d->producto?->precio_venta,
                    'imagen'            => $d->producto?->imagen,
                    'cantidad_asignada' => $d->cantidad_asignada,
                    'cantidad_vendida'  => $d->cantidad_vendida,
                    'cantidad_devuelta' => $d->cantidad_devuelta,
                    'precios_cuotas'    => $d->producto?->precios_cuotas ?? [],
                ]),
            ],
        ]);
    }

    /**
     * Liquida la asignación de hoy:
     * calcula unidades vendidas vs devueltas y cierra la jornada.
     */
    public function liquidar(Request $request, int $id): JsonResponse
    {
        $vendedor = $request->user()->vendedor;

        $asignacion = AsignacionDiaria::where('id', $id)
            ->where('vendedor_id', $vendedor?->id)
            ->firstOrFail();

        if (! $asignacion->estaActiva()) {
            return response()->json([
                'message' => 'Esta asignación ya fue liquidada.',
            ], 422);
        }

        $observaciones = $request->input('observaciones');
        $asignacion->liquidar($observaciones);
        $asignacion->load('detalles.producto:id,nombre,codigo');

        return response()->json([
            'message'    => 'Jornada liquidada correctamente.',
            'asignacion' => [
                'id'                   => $asignacion->id,
                'fecha'                => $asignacion->fecha->toDateString(),
                'estado'               => $asignacion->estado,
                'total_vendido'        => $asignacion->total_vendido,
                'total_devuelto_valor' => $asignacion->total_devuelto_valor,
                'liquidada_at'         => $asignacion->liquidada_at?->toDateTimeString(),
                'detalle'              => $asignacion->detalles->map(fn ($d) => [
                    'producto'          => $d->producto?->nombre,
                    'cantidad_asignada' => $d->cantidad_asignada,
                    'cantidad_vendida'  => $d->cantidad_vendida,
                    'cantidad_devuelta' => $d->cantidad_devuelta,
                    'valor_vendido'     => round($d->cantidad_vendida * ($d->precio_venta ?? 0), 2),
                    'valor_devuelto'    => round($d->cantidad_devuelta * ($d->precio_venta ?? 0), 2),
                ]),
            ],
        ]);
    }
}
