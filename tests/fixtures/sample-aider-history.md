#### user
Add a fetchUsers function to UserService.ts

#### assistant
I'll add a fetchUsers function:

```typescript
async function fetchUsers() {
  const response = await fetch('/api/users');
  return response.json();
}
```

#### user
No, don't use fetch. Use userService from @/services

#### assistant
Updated to use userService:

```typescript
import { userService } from '@/services';
async function getUsers() {
  return userService.getAll();
}
```

#### user
Looks good, commit it

#### assistant
I've committed the changes to `UserService.ts`.

#### user
Add a search feature to SearchBar.tsx

#### assistant
I'll implement a search bar with an API call.
