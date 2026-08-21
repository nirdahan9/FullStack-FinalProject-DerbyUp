import { z } from "zod";

/**
 * Auth input schemas. These run on the server, inside the Server Action, and
 * are the validation that actually counts — anything enforced only in the
 * browser can be bypassed from the console.
 */
export const signUpSchema = z.object({
  email: z.string().trim().min(1, "יש להזין כתובת אימייל").email("כתובת אימייל לא תקינה"),
  password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים").max(72, "הסיסמה ארוכה מדי"),
  displayName: z
    .string()
    .trim()
    .min(2, "השם חייב להכיל לפחות 2 תווים")
    .max(60, "השם ארוך מדי"),
});

export const signInSchema = z.object({
  email: z.string().trim().min(1, "יש להזין כתובת אימייל").email("כתובת אימייל לא תקינה"),
  password: z.string().min(1, "יש להזין סיסמה"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
