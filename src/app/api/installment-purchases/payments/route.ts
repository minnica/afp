import { ApiAccessError, apiAccessErrorResponse, apiResponse, requireApiUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { formatReceivable, receivableSelect } from "@/lib/receivableAccounts";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const purchaseId = new URL(request.url).searchParams.get("purchaseId")?.trim();
    if (!purchaseId || purchaseId.length > 200) {
      return apiResponse.json({ error: "Selecciona una compra para consultar sus pagos." }, { status: 400 });
    }

    const result = await prisma.$transaction(async tx => {
      const purchase = await tx.installmentPurchase.findFirst({
        where: { id: purchaseId, userId: user.id },
        select: { id: true, concept: true, receivableAccountId: true },
      });
      if (!purchase) throw new ApiAccessError("Compra no encontrada.", 404);

      let receivable = null;
      if (purchase.receivableAccountId) {
        const account = await tx.receivableAccount.findFirst({
          where: { id: purchase.receivableAccountId, userId: user.id },
          select: {
            ...receivableSelect,
            incomes: {
              ...receivableSelect.incomes,
              where: { userId: user.id },
              orderBy: [{ date: "desc" }, { id: "desc" }],
            },
          },
        });
        if (!account) throw new ApiAccessError("Cuenta por cobrar no encontrada.", 404);
        receivable = formatReceivable(account);
      }
      return { purchase: { id: purchase.id, concept: purchase.concept }, receivable };
    }, { isolationLevel: "RepeatableRead" });

    return apiResponse.json(result);
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error loading installment purchase payments:", error);
    return apiResponse.json({ error: "No se pudieron cargar los pagos de esta compra. Inténtalo de nuevo." }, { status: 500 });
  }
}
