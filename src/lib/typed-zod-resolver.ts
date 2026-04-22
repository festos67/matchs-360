import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";
import type { ZodTypeAny } from "zod";

export function typedZodResolver<TFieldValues extends FieldValues>(
  schema: ZodTypeAny,
): Resolver<TFieldValues> {
  return zodResolver(schema as never) as Resolver<TFieldValues>;
}