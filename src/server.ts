import { app } from './app.ts';
import { env } from './config/env.ts';

app.listen(env.PORT);
