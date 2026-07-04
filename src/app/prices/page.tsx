import {
  createPriceItem,
  deletePriceItem,
  updatePriceItem,
} from "@/lib/actions";
import { getPriceItems } from "@/lib/prices";
import {
  PRICE_KIND,
  SUB_TYPE,
  formatMoney,
  type PriceKind,
  type SubType,
} from "@/lib/domain";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { IconX } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function PricesPage() {
  const prices = await getPriceItems();
  const active = prices.filter((p) => p.active);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Прайс"
        subtitle="Тарифы для новых абонементов, разовых и пробных занятий."
      />

      <section>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm text-muted">Активных тарифов</p>
            <p className="mt-1 text-2xl font-bold text-ink">{active.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted">Абонементы</p>
            <p className="mt-1 text-2xl font-bold text-ink">
              {active.filter((p) => p.kind === "subscription").length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted">Разовые/пробные</p>
            <p className="mt-1 text-2xl font-bold text-ink">
              {active.filter((p) => p.kind !== "subscription").length}
            </p>
          </Card>
        </div>
      </section>

      <section>
        <SectionTitle>Добавить тариф</SectionTitle>
        <Card className="p-4">
          <PriceForm action={createPriceItem} submit="Добавить" />
        </Card>
      </section>

      <section>
        <SectionTitle>Текущие тарифы</SectionTitle>
        <div className="space-y-3">
          {prices.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{item.name}</p>
                    <Badge tone={item.active ? "green" : "slate"}>
                      {item.active ? "Активен" : "Скрыт"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {PRICE_KIND[item.kind as PriceKind]?.label ?? item.kind} ·{" "}
                    {SUB_TYPE[item.type as SubType]?.label ?? item.type} ·{" "}
                    {formatMoney(item.price)}
                    {item.kind === "subscription" && item.minLessons
                      ? ` · от ${item.minLessons} занятий`
                      : ""}
                  </p>
                </div>
                <form action={deletePriceItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    aria-label="Удалить тариф"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted/50 hover:bg-red-50 hover:text-red-500"
                  >
                    <IconX className="size-4" />
                  </button>
                </form>
              </div>
              <PriceForm action={updatePriceItem} item={item} submit="Сохранить" />
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function PriceForm({
  action,
  item,
  submit,
}: {
  action: (fd: FormData) => Promise<void>;
  item?: {
    id: number;
    name: string;
    kind: string;
    type: string;
    price: number;
    minLessons: number | null;
    active: boolean;
    sortOrder: number;
  };
  submit: string;
}) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="Название">
        <Input
          name="name"
          defaultValue={item?.name ?? ""}
          placeholder="Например, индивидуальное занятие"
          required
        />
      </Field>
      <Field label="Тип">
        <Select name="kind" defaultValue={item?.kind ?? "subscription"}>
          <option value="subscription">Абонемент</option>
          <option value="single">Разовое</option>
          <option value="trial">Пробное</option>
        </Select>
      </Field>
      <Field label="Формат">
        <Select name="type" defaultValue={item?.type ?? "offline"}>
          <option value="offline">Офлайн</option>
          <option value="online">Онлайн</option>
        </Select>
      </Field>
      <Field label="Цена, ₽">
        <Input
          name="price"
          type="number"
          min={0}
          step={50}
          defaultValue={item?.price ?? 0}
          required
        />
      </Field>
      <Field label="Мин. занятий">
        <Input
          name="minLessons"
          type="number"
          min={1}
          step={1}
          defaultValue={item?.minLessons ?? 4}
        />
      </Field>
      <div className="flex items-end gap-2">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-ink">
          <input
            name="active"
            type="checkbox"
            defaultChecked={item?.active ?? true}
            className="size-4 accent-[var(--color-brand)]"
          />
          Активен
        </label>
        <input
          type="hidden"
          name="sortOrder"
          value={item?.sortOrder ?? 100}
        />
        <SubmitButton size="sm" className="shrink-0">
          {submit}
        </SubmitButton>
      </div>
    </form>
  );
}
